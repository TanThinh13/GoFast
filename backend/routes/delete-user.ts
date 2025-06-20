import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

router.delete('/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    const { error: dbError } = await supabaseAdmin
      .from('Users')
      .delete()
      .eq('id', userId);
    if (dbError) throw dbError;

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) throw authError;

    res.status(200).json({ message: 'Xóa người dùng thành công.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
