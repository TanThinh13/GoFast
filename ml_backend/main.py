import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import joblib
import pandas as pd
import requests
from datetime import datetime
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
from dotenv import load_dotenv
import logging
import math # Import math for isnan

# --- 0. Cấu hình Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- 1. Tải Biến Môi Trường ---
load_dotenv()

# --- 2. Khởi tạo FastAPI App ---
app = FastAPI(
    title="GoFast Delivery Optimization Service",
    description="API for delivery duration prediction and route optimization using OR-Tools, integrating with Mapbox for routing data.",
    version="1.0.0"
)

# --- 3. Cấu hình Ứng Dụng ---
MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN")
if not MAPBOX_ACCESS_TOKEN:
    logger.error("MAPBOX_ACCESS_TOKEN not set in environment variables.")
    raise ValueError("MAPBOX_ACCESS_TOKEN not set in environment variables. Please check your .env file.")

# Địa chỉ kho mặc định (ví dụ ở TP.HCM)
WAREHOUSE_COORDS = {
    "latitude": float(os.getenv("WAREHOUSE_LATITUDE", 10.8453773)),
    "longitude": float(os.getenv("WAREHOUSE_LONGITUDE", 106.794445))
}
logger.info(f"Warehouse coordinates: {WAREHOUSE_COORDS}")

# Tải model dự đoán thời gian giao hàng
DELIVERY_MODEL = None
MODEL_PATH = os.getenv("DELIVERY_MODEL_PATH", "delivery_duration_predictor_full_features.pkl")
try:
    if os.path.exists(MODEL_PATH):
        DELIVERY_MODEL = joblib.load(MODEL_PATH)
        logger.info(f"Delivery duration model loaded successfully from {MODEL_PATH}.")
    else:
        logger.warning(f"Delivery model file not found at {MODEL_PATH}. Prediction functionality will be disabled for time optimization.")
except Exception as e:
    logger.error(f"Error loading delivery model from {MODEL_PATH}: {e}")
    DELIVERY_MODEL = None # Đảm bảo model là None nếu có lỗi

# --- 4. Định nghĩa Pydantic Models ---

class OrderInput(BaseModel):
    id: str
    latitude: float
    longitude: float
    weight: float = Field(..., gt=0, description="Weight of the order in kg.")

class RoutePoint(BaseModel):
    id: Optional[str] = None # Có thể là ID đơn hàng hoặc None nếu là kho
    type: str # "warehouse", "order", or "current_location"
    latitude: float
    longitude: float

class RouteSegmentDetail(BaseModel):
    from_point_id: Optional[str] = None
    to_point_id: Optional[str] = None
    from_type: str
    to_type: str
    duration_seconds: float # Thời gian dự kiến cho phân đoạn này
    distance_meters: float # Khoảng cách dự kiến cho phân đoạn này

class Step(BaseModel):
    instruction: str
    name: str
    distance: float
    duration: float
    type: str
    exit_bearing: Optional[float] = None
    maneuver_modifier: Optional[str] = None
    mode: Optional[str] = None
    intersections: Optional[List[Dict]] = None

class Leg(BaseModel):
    summary: str
    distance: float
    duration: float
    steps: List[Step]

class RouteGeometry(BaseModel):
    polyline: str # Chuỗi polyline được mã hóa cho toàn bộ lộ trình

class OptimizedRouteResponse(BaseModel):
    optimized_route: List[RoutePoint]
    total_predicted_time_seconds: float
    total_distance_meters: float
    message: str = "Route optimized successfully."
    segments_details: Optional[List[RouteSegmentDetail]] = None
    full_route_geometry: Optional[RouteGeometry] = None # Polyline cho toàn bộ lộ trình
    full_route_legs: Optional[List[Leg]] = None # Hướng dẫn từng chặng chi tiết

class OptimizeRouteRequest(BaseModel):
    orders: List[OrderInput]
    warehouse_latitude: Optional[float] = None
    warehouse_longitude: Optional[float] = None
    current_latitude: float = Field(..., description="Current latitude of the delivery vehicle.") # Added current_latitude
    current_longitude: float = Field(..., description="Current longitude of the delivery vehicle.") # Added current_longitude
    # Thay thế optimize_by_distance bằng trọng số cho thời gian và khoảng cách
    weight_time: float = Field(0.5, ge=0.0, le=1.0, description="Trọng số ưu tiên thời gian (0.0 đến 1.0).")
    weight_distance: float = Field(0.5, ge=0.0, le=1.0, description="Trọng số ưu tiên khoảng cách (0.0 đến 1.0).")

# --- 5. Hàm Helper (Mapbox API Call) ---

def get_mapbox_route_data(
    coords: List[tuple], # Nhận danh sách các cặp (longitude, latitude)
    profile: str = "driving",
    geometries: str = "polyline",
    overview: str = "full",
    steps: bool = False
) -> Optional[Dict[str, Any]]:
    """
    Lấy dữ liệu lộ trình từ Mapbox Directions API cho một hoặc nhiều điểm.
    Args:
        coords (List[tuple]): Danh sách các cặp (longitude, latitude) của các điểm.
        profile (str): Kiểu phương tiện ('driving', 'walking', 'cycling').
        geometries (str): Định dạng của geometry ('geojson', 'polyline', 'polyline6').
        overview (str): Mức độ chi tiết của geometry ('full', 'simplified', 'false').
        steps (bool): Có bao gồm chi tiết từng bước hướng dẫn hay không.
    Returns:
        Optional[Dict]: Dữ liệu lộ trình từ Mapbox hoặc None nếu có lỗi.
    """
    if not coords or len(coords) < 1:
        logger.warning("No coordinates provided for Mapbox route data.")
        return None

    coords_str = ";".join([f"{lon},{lat}" for lon, lat in coords])
    url = f"https://api.mapbox.com/directions/v5/mapbox/{profile}/{coords_str}"
    params = {
        "alternatives": "false",
        "geometries": geometries,
        "steps": str(steps).lower(),
        "overview": overview,
        "access_token": MAPBOX_ACCESS_TOKEN
    }
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data and data.get('routes'):
            return data['routes'][0]
        logger.warning(f"Mapbox Directions API returned no routes for coordinates: {coords_str}. Response: {data}")
        return None
    except requests.exceptions.Timeout:
        logger.error(f"Mapbox API request timed out for coordinates: {coords_str}.")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling Mapbox Directions API for coordinates: {coords_str}: {e}")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred while processing Mapbox response for coordinates: {coords_str}: {e}")
    return None

# --- 6. Hàm Helper (OR-Tools Solver) ---
INTEGER_SCALE_FACTOR = 1000 # Scale factor for converting float costs to integers for OR-Tools

def solve_tsp_with_ortools(cost_matrix: List[List[float]], num_nodes: int,start_depot_index:int, end_depot_index: int) -> Optional[Dict[str, Any]]:
    """
    Giải bài toán TSP bằng OR-Tools.
    Args:
        cost_matrix (List[List[float]]): Ma trận chi phí giữa các điểm.
        num_nodes (int): Tổng số điểm (bao gồm kho).
        depot_index (int): Chỉ số của kho (điểm bắt đầu/kết thúc).
    Returns:
        Optional[Dict]: Một dict chứa 'route_indices' và 'total_cost' hoặc None nếu không tìm thấy giải pháp.
    """
    manager = pywrapcp.RoutingIndexManager(num_nodes, 1, [start_depot_index], [end_depot_index]) # 1 vehicle, start and end at depot_index
    routing = pywrapcp.RoutingModel(manager)

    # Chuyển đổi ma trận chi phí float sang int.
    # OR-Tools cần chi phí không âm. Nếu có float('inf'), thay thế bằng giá trị lớn.
    # Max integer value for OR-Tools can be limited, so pick a reasonably large number.
    MAX_ORTOOLS_COST = 1_000_000_000 # 1 tỷ, đảm bảo đủ lớn nhưng không tràn số nguyên
    scaled_cost_matrix = [[int(min(MAX_ORTOOLS_COST, cost * INTEGER_SCALE_FACTOR)) if cost != float('inf') else MAX_ORTOOLS_COST for cost in row] for row in cost_matrix]

    def travel_cost_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        # Ensure non-negative cost
        return max(0, scaled_cost_matrix[from_node][to_node])

    transit_callback_index = routing.RegisterTransitCallback(travel_cost_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
    search_parameters.time_limit.seconds = 15 # Tăng giới hạn thời gian tìm kiếm

    logger.info("Solving routing problem with OR-Tools...")
    solution = routing.SolveWithParameters(search_parameters)

    if not solution:
        logger.error("No solution found by OR-Tools.")
        return None

    logger.info("Solution found.")

    optimized_route_indices: List[int] = []
    index = routing.Start(0)
    total_cost = 0.0 # This will be the combined cost, not just time or distance
    while not routing.IsEnd(index):
        current_node = manager.IndexToNode(index)
        optimized_route_indices.append(current_node)
        next_node_index = solution.Value(routing.NextVar(index))
        next_node = manager.IndexToNode(next_node_index)
        # Sử dụng chi phí gốc (float) để tính tổng
        total_cost += cost_matrix[current_node][next_node]
        index = next_node_index
    optimized_route_indices.append(manager.IndexToNode(index)) # Thêm điểm cuối (kho)

    return {
        "route_indices": optimized_route_indices,
        "total_cost": total_cost # This total_cost is the combined cost
    }


# --- 7. Endpoint Tối ưu hóa Lộ trình ---

@app.post("/optimize_delivery_route/", response_model=OptimizedRouteResponse)
async def optimize_delivery_route(request: OptimizeRouteRequest):
    """
    Tối ưu hóa lộ trình giao hàng sử dụng OR-Tools với hàm chi phí kết hợp thời gian và khoảng cách.
    Điểm bắt đầu là vị trí hiện tại của thiết bị, điểm kết thúc là kho.
    """
    # 7.1. Xử lý yêu cầu đầu vào
    # Sử dụng tọa độ kho từ request nếu có, nếu không thì dùng mặc định
    warehouse_lat = request.warehouse_latitude if request.warehouse_latitude is not None else WAREHOUSE_COORDS["latitude"]
    warehouse_lon = request.warehouse_longitude if request.warehouse_longitude is not None else WAREHOUSE_COORDS["longitude"]

    # Define all points: current location, then orders, then warehouse
    all_points_details: List[Dict[str, Any]] = [
        {"type": "current_location", "latitude": request.current_latitude, "longitude": request.current_longitude, "id": "current_location_0"}
    ] + [
        {"id": order.id, "type": "order", "latitude": order.latitude, "longitude": order.longitude, "weight": order.weight}
        for order in request.orders
    ] + [
        {"type": "warehouse", "latitude": warehouse_lat, "longitude": warehouse_lon, "id": "warehouse_final"}
    ]

    num_points = len(all_points_details)

    if num_points <= 1: # Only current location or current location + warehouse, no orders
        return OptimizedRouteResponse(
            optimized_route=[RoutePoint(type="current_location", latitude=request.current_latitude, longitude=request.current_longitude),
                             RoutePoint(type="warehouse", latitude=warehouse_lat, longitude=warehouse_lon)],
            total_predicted_time_seconds=0.0,
            total_distance_meters=0.0,
            message="No orders provided or only current location and warehouse. Returning direct route to warehouse."
        )

    # Determine depot index dynamically: it's the current location for start, and warehouse for end
    depot_index = 0 # Current location is always the first point
    warehouse_node_index = num_points - 1 # Warehouse is always the last point

    # Đảm bảo tổng trọng số là 1 (hoặc chuẩn hóa chúng)
    total_weights = request.weight_time + request.weight_distance
    if total_weights == 0:
        raise HTTPException(status_code=400, detail="Total weights for time and distance cannot be zero.")
    
    # Chuẩn hóa trọng số để tổng bằng 1
    normalized_weight_time = request.weight_time / total_weights
    normalized_weight_distance = request.weight_distance / total_weights
    logger.info(f"Normalized weights: time={normalized_weight_time}, distance={normalized_weight_distance}")

    # 7.2. Chuẩn bị ma trận chi phí
    cost_matrix: List[List[float]] = [[0.0] * num_points for _ in range(num_points)]
    all_segments_data_cache: Dict[str, Dict[str, Any]] = {} # Lưu trữ khoảng cách và thời gian cho mỗi phân đoạn

    # Lấy thời gian hiện tại cho các tính năng của mô hình ML
    current_hour = datetime.now().hour
    current_day = datetime.now().weekday() # Thứ Hai là 0, Chủ Nhật là 6
    
    # Để chuẩn hóa, cần tìm max duration và max distance trong tất cả các cặp điểm
    max_duration_for_normalization = 0.0
    max_distance_for_normalization = 0.0

    # Lượt 1: Lấy dữ liệu Mapbox và ML, tìm max_duration/distance để chuẩn hóa
    for i in range(num_points):
        for j in range(num_points):
            if i == j:
                continue

            start_lon, start_lat = all_points_details[i]["longitude"], all_points_details[i]["latitude"]
            end_lon, end_lat = all_points_details[j]["longitude"], all_points_details[j]["latitude"]

            cache_key = f"{start_lon},{start_lat}-{end_lon},{end_lat}"
            
            mapbox_data = get_mapbox_route_data([(start_lon, start_lat), (end_lon, end_lat)], geometries="polyline", overview="simplified")
            
            shipping_distance = mapbox_data.get('distance', float('inf')) if mapbox_data else float('inf')
            mapbox_duration = mapbox_data.get('duration', float('inf')) if mapbox_data else float('inf')

            predicted_duration = mapbox_duration # Mặc định là Mapbox duration
            
            if DELIVERY_MODEL:
                # Use 0.0 for weight if it's the current location or warehouse (not an order)
                current_point_type = all_points_details[j]["type"]
                current_order_weight = all_points_details[j].get("weight", 0.0) if current_point_type == "order" else 0.0

                features_df = pd.DataFrame([{
                    "senderLat": start_lat, "senderLng": start_lon,
                    "receiverLat": end_lat, "receiverLng": end_lon,
                    "weight": current_order_weight,
                    "order_hour": current_hour,
                    "order_day": current_day,
                    "shippingDistance": shipping_distance # Khoảng cách từ Mapbox làm một tính năng
                }])
                try:
                    ml_predicted_duration = DELIVERY_MODEL.predict(features_df)[0]
                    # Logic mới: chọn giá trị nhỏ hơn giữa ML dự đoán và Mapbox duration
                    chosen_duration = min(ml_predicted_duration, mapbox_duration)
                    # Đảm bảo thời gian dự đoán không âm
                    predicted_duration = max(0.0, chosen_duration)
                except Exception as e:
                    logger.warning(f"ML prediction error for points {i}-{j}: {e}. Falling back to Mapbox duration for cost.")
                    predicted_duration = mapbox_duration # Dự phòng về thời gian Mapbox khi ML lỗi
            
            # Đảm bảo các giá trị không phải inf và không âm trước khi lưu vào cache
            # Thay thế inf bằng một giá trị rất lớn để tránh lỗi trong các phép toán sau này
            if shipping_distance == float('inf') or math.isnan(shipping_distance) or shipping_distance < 0:
                shipping_distance = 1_000_000_000 # Giá trị lớn cố định
            if predicted_duration == float('inf') or math.isnan(predicted_duration) or predicted_duration < 0:
                predicted_duration = 1_000_000_000 # Giá trị lớn cố định

            all_segments_data_cache[cache_key] = {
                'distance': shipping_distance,
                'duration': predicted_duration,
                '_mapbox_raw_': mapbox_data # Lưu trữ dữ liệu Mapbox thô nếu cần sau này
            }
            
            max_duration_for_normalization = max(max_duration_for_normalization, predicted_duration)
            max_distance_for_normalization = max(max_distance_for_normalization, shipping_distance)
            
    # Đảm bảo các giá trị max không phải là 0 để tránh chia cho 0 khi chuẩn hóa
    max_duration_for_normalization = max(1.0, max_duration_for_normalization)
    max_distance_for_normalization = max(1.0, max_distance_for_normalization)
    
    logger.info(f"Max duration for normalization: {max_duration_for_normalization}")
    logger.info(f"Max distance for normalization: {max_distance_for_normalization}")

    # Lượt 2: Xây dựng cost_matrix sử dụng giá trị đã chuẩn hóa và trọng số
    for i in range(num_points):
        for j in range(num_points):
            if i == j:
                cost_matrix[i][j] = 0.0 # Cost from a point to itself is 0
                continue

            start_lon, start_lat = all_points_details[i]["longitude"], all_points_details[i]["latitude"]
            end_lon, end_lat = all_points_details[j]["longitude"], all_points_details[j]["latitude"]
            cache_key = f"{start_lon},{start_lat}-{end_lon},{end_lat}"

            segment_data = all_segments_data_cache.get(cache_key)
            if segment_data:
                current_distance = segment_data['distance']
                current_duration = segment_data['duration']
                
                # Chuẩn hóa khoảng cách và thời gian về [0, 1]
                normalized_distance = current_distance / max_distance_for_normalization
                normalized_duration = current_duration / max_duration_for_normalization
                
                # Tính chi phí kết hợp
                combined_cost = (normalized_weight_time * normalized_duration) + \
                                (normalized_weight_distance * normalized_distance)
                
                cost_matrix[i][j] = combined_cost
            else:
                # Trường hợp không có dữ liệu (lỗi Mapbox)
                cost_matrix[i][j] = float('inf')
                logger.warning(f"No cached data for {start_lon},{start_lat} to {end_lon},{end_lat}. Setting inf cost.")


    # 7.3. Giải bài toán TSP bằng OR-Tools
    # The OR-Tools vehicle starts at depot_index (current_location) and ends at depot_index (warehouse_node_index)
    ortools_result = solve_tsp_with_ortools(cost_matrix, num_points, depot_index,warehouse_node_index) # Use depot_index for start and end

    if not ortools_result:
        raise HTTPException(status_code=500, detail="Failed to find an optimal route with OR-Tools.")

    optimized_route_indices = ortools_result["route_indices"]

    # 7.4. Xây dựng phản hồi chi tiết
    optimized_route_points: List[RoutePoint] = []
    actual_total_predicted_time_seconds = 0.0
    actual_total_distance_meters = 0.0
    segments_details_list: List[RouteSegmentDetail] = []
    full_route_coords_for_mapbox: List[tuple] = [] # Danh sách tọa độ cho Mapbox để lấy toàn bộ route geometry

    # Ensure the route starts at the current location and ends at the warehouse
    # The OR-Tools result should already respect the start_end_depot parameter.
    # We will verify the first and last points are correct.
    
    # The first point in optimized_route_indices must be the current_location (depot_index = 0).
    # The last point in optimized_route_indices must be the warehouse (warehouse_node_index = num_points - 1).
    if not optimized_route_indices or optimized_route_indices[0] != depot_index or optimized_route_indices[-1] != warehouse_node_index:
        logger.error(f"OR-Tools did not return a route starting at current location ({depot_index}) and ending at warehouse ({warehouse_node_index}).")
        # Fallback to a direct route if the optimized one is invalid
        optimized_route_indices = [depot_index] + [i for i in range(1, num_points - 1)] + [warehouse_node_index]


    # Fill optimized_route_points and full_route_coords_for_mapbox
    for idx in optimized_route_indices:
        if 0 <= idx < len(all_points_details):
            point_detail = all_points_details[idx]
            optimized_route_points.append(RoutePoint(
                type=point_detail["type"],
                id=point_detail.get("id"),
                latitude=point_detail["latitude"],
                longitude=point_detail["longitude"]
            ))
            full_route_coords_for_mapbox.append((point_detail["longitude"], point_detail["latitude"]))
        else:
            logger.warning(f"OR-Tools returned an invalid node index: {idx}. Skipping this point.")

    # Lấy thông tin lộ trình đầy đủ (polyline và steps) từ Mapbox cho toàn bộ lộ trình tối ưu
    full_route_geometry_obj: Optional[RouteGeometry] = None
    full_route_legs_list: Optional[List[Leg]] = None

    if len(full_route_coords_for_mapbox) > 1:
        full_route_mapbox_data = get_mapbox_route_data(
            full_route_coords_for_mapbox,
            geometries="polyline",
            overview="full", # Lấy overview đầy đủ để có polyline chi tiết
            steps=True      # Lấy steps (hướng dẫn từng chặng)
        )
        if full_route_mapbox_data:
            if 'geometry' in full_route_mapbox_data:
                full_route_geometry_obj = RouteGeometry(polyline=full_route_mapbox_data['geometry'])
            if 'legs' in full_route_mapbox_data:
                full_route_legs_list = []
                for leg_data in full_route_mapbox_data['legs']:
                    steps_list = []
                    for step_data in leg_data.get('steps', []):
                        steps_list.append(Step(
                            instruction=step_data.get('maneuver', {}).get('instruction', ''),
                            name=step_data.get('name', ''),
                            distance=step_data.get('distance', 0.0),
                            duration=step_data.get('duration', 0.0),
                            type=step_data.get('maneuver', {}).get('type', ''),
                            exit_bearing=step_data.get('maneuver', {}).get('exit_bearing'),
                            maneuver_modifier=step_data.get('maneuver', {}).get('modifier'),
                            mode=step_data.get('mode'),
                            intersections=step_data.get('intersections')
                        ))
                    full_route_legs_list.append(Leg(
                        summary=leg_data.get('summary', ''),
                        distance=leg_data.get('distance', 0.0),
                        duration=leg_data.get('duration', 0.0),
                        steps=steps_list
                    ))
    else:
        logger.warning("Not enough points to request full route geometry from Mapbox.")


    # Tính tổng thời gian và khoảng cách thực tế dựa trên lộ trình tối ưu và dữ liệu đã cache
    for i in range(len(optimized_route_indices) - 1):
        from_idx = optimized_route_indices[i]
        to_idx = optimized_route_indices[i+1]

        start_lon, start_lat = all_points_details[from_idx]["longitude"], all_points_details[from_idx]["latitude"]
        end_lon, end_lat = all_points_details[to_idx]["longitude"], all_points_details[to_idx]["latitude"]
        cache_key = f"{start_lon},{start_lat}-{end_lon},{end_lat}"

        segment_data = all_segments_data_cache.get(cache_key)
        if segment_data and segment_data['distance'] != float('inf') and segment_data['duration'] != float('inf'):
            segment_distance = segment_data['distance']
            segment_duration = segment_data['duration'] # Đây là duration đã được quyết định (ML hoặc Mapbox)

            actual_total_distance_meters += segment_distance
            actual_total_predicted_time_seconds += segment_duration

            segments_details_list.append(RouteSegmentDetail(
                from_point_id=all_points_details[from_idx].get("id"),
                to_point_id=all_points_details[to_idx].get("id"),
                from_type=all_points_details[from_idx]["type"],
                to_type=all_points_details[to_idx]["type"],
                duration_seconds=segment_duration,
                distance_meters=segment_distance
            ))
        else:
            # Nếu không có dữ liệu cache hợp lệ (ví dụ, do lỗi Mapbox ban đầu), thêm segment với inf
            segments_details_list.append(RouteSegmentDetail(
                from_point_id=all_points_details[from_idx].get("id"),
                to_point_id=all_points_details[to_idx].get("id"),
                from_type=all_points_details[from_idx]["type"],
                to_type=all_points_details[to_idx]["type"],
                duration_seconds=float('inf'), # Đặt inf nếu không có dữ liệu hợp lệ
                distance_meters=float('inf')
            ))


    logger.info(f"Optimized route: {[p.id or p.type for p in optimized_route_points]}")
    logger.info(f"Total predicted time: {actual_total_predicted_time_seconds} seconds")
    logger.info(f"Total distance: {actual_total_distance_meters} meters")

    return OptimizedRouteResponse(
        optimized_route=optimized_route_points,
        total_predicted_time_seconds=actual_total_predicted_time_seconds,
        total_distance_meters=actual_total_distance_meters,
        segments_details=segments_details_list,
        full_route_geometry=full_route_geometry_obj,
        full_route_legs=full_route_legs_list
    )

# --- 8. Hàm kiểm tra sức khỏe API ---
@app.get("/")
async def read_root():
    return {"message": "GoFast Delivery Optimization Service is running."}

# --- 9. Run the FastAPI app with Uvicorn ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)