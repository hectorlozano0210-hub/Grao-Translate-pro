import express from "express";
import db from "../db";

const router = express.Router();

router.post("/register-id", async (req, res) => {

  const { deviceId } = req.body;

  try {

    const [rows] = await db.query(
      "SELECT id FROM devices WHERE device_id = ?",
      [deviceId]
    );

    if (rows.length === 0) {

      await db.query(
        "INSERT INTO devices (device_id, status) VALUES (?, 'pending')",
        [deviceId]
      );

    }

    res.json({ success: true });

  } catch (error) {

    console.error(error);
    res.status(500).json({ error: "DB error" });

  }

});

export default router;