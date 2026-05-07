const express = require("express");
const router = express.Router();

// Menú en memoria
let weeklyMenu = require("../data/menu");

/* OBTENER TODO EL MENÚ */
router.get("/", (req, res) => {
  res.json(weeklyMenu);
});

/* OBTENER MENÚ POR DÍA */
router.get("/:day", (req, res) => {
  const { day } = req.params;

  res.json({
    day,
    products: weeklyMenu[day] || []
  });
});

/* GUARDAR MENÚ POR DÍA */
router.post("/day", (req, res) => {
  const { day, products } = req.body;

  if (!day || !products) {
    return res.status(400).json({
      message: "Faltan datos (day, products)"
    });
  }

  weeklyMenu[day] = products;

  // WebSocket: notificar que el menú cambió
  const io = req.app.get("io");
  if (io) {
    io.emit("menu-updated", { day, products });
  }

  res.json({
    message: "Menú guardado",
    weeklyMenu
  });
});

module.exports = router;