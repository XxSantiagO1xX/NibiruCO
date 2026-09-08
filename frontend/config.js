// MealOps Frontend - Configuración centralizada
const MEALOPS_CONFIG = {
  // En caso de estar alojado en el mismo host o en un servidor separado
  API_URL: window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : `http://${window.location.hostname}:3000`
};

window.MEALOPS_CONFIG = MEALOPS_CONFIG;
