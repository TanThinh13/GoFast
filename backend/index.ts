import dotenv from 'dotenv';
dotenv.config(); // Đặt trên cùng

import express from 'express';
import cors from 'cors';
import deleteUserRoute from './routes/delete-user';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/delete-user', deleteUserRoute);

app.listen(PORT, () => {
  console.log(`🚀 Backend đang chạy tại http://localhost:${PORT}`);
});
