const express = require("express");
const router = express.Router();

let weeklyMenu = require("../data/menu");

// Obtener todo el menú
router.get("/", (req, res) => {
  res.json(weeklyMenu);
});

// Obtener menú por día
router.get("/:day", (req, res) => {
  const { day } = req.params;

  res.json({
    day,
    products: weeklyMenu[day] || []
  });
});

// Guardar menú por día
router.post("/day", (req, res) => {
  const { day, products } = req.body;

  if (!day || !products) {
    return res.status(400).json({
      message: "Faltan datos (day, products)"
    });
  }

  weeklyMenu[day] = products;

  res.json({
    message: "Menú guardado",
    weeklyMenu
  });
});

module.exports = router;