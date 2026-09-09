/**
 * Routing and ETA calculation service using Strategy Pattern.
 */

class RoutingProvider {
  /**
   * @param {Array} stops - Array of { id, order_id, stop_order, lat, lng }
   * @param {Object} originCoords - { lat, lng }
   * @returns {Array} Array of ETAs
   */
  async calculateStopETAs(stops, originCoords) {
    throw new Error('Not implemented');
  }

  /**
   * @param {Array} stops
   * @param {Object} originCoords
   * @returns {Array} Reordered stops
   */
  async optimizeStopSequence(stops, originCoords) {
    throw new Error('Not implemented');
  }

  getName() {
    return 'abstract';
  }
}

class HeuristicRoutingProvider extends RoutingProvider {
  getName() {
    return 'heuristic';
  }

  // Haversine formula
  _getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
  }

  async calculateStopETAs(stops, originCoords) {
    if (!stops || stops.length === 0) return [];
    if (!originCoords || !originCoords.lat || !originCoords.lng) {
      throw new Error('Valid origin coordinates are required');
    }

    const URBAN_SPEED_KMH = 22;
    const STOP_TIME_MINUTES = 3;
    const results = [];
    
    let currentCoords = originCoords;
    let accumulatedTime = 0;

    // Assuming stops are already ordered or we evaluate them in given sequence
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (!stop.lat || !stop.lng) continue; // Skip invalid stops
      
      const distanceKm = this._getDistanceKm(currentCoords.lat, currentCoords.lng, stop.lat, stop.lng);
      const travelTimeMinutes = (distanceKm / URBAN_SPEED_KMH) * 60;
      
      // Calculate eta for this stop
      // accumulatedTime includes travel time and time spent at previous stops
      accumulatedTime += travelTimeMinutes;
      const eta_minutes = Math.round(accumulatedTime);
      
      const eta_min_minutes = Math.max(1, eta_minutes - 3);
      const eta_max_minutes = eta_minutes + 5;
      
      const estimated_arrival_at = new Date(Date.now() + eta_minutes * 60000);
      
      results.push({
        stop_id: stop.id,
        order_id: stop.order_id,
        eta_minutes,
        eta_min_minutes,
        eta_max_minutes,
        estimated_arrival_at,
        eta_source: this.getName()
      });
      
      // Update for next stop: time spent at this stop
      accumulatedTime += STOP_TIME_MINUTES;
      currentCoords = { lat: stop.lat, lng: stop.lng };
    }

    return results;
  }

  async optimizeStopSequence(stops, originCoords) {
    if (!stops || stops.length <= 1) return stops;
    
    const unvisited = [...stops];
    const ordered = [];
    let currentCoords = originCoords;

    while (unvisited.length > 0) {
      let nearestIndex = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const stop = unvisited[i];
        if (!stop.lat || !stop.lng) continue;
        
        const dist = this._getDistanceKm(currentCoords.lat, currentCoords.lng, stop.lat, stop.lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIndex = i;
        }
      }

      const nearestStop = unvisited.splice(nearestIndex, 1)[0];
      ordered.push(nearestStop);
      if (nearestStop.lat && nearestStop.lng) {
         currentCoords = { lat: nearestStop.lat, lng: nearestStop.lng };
      }
    }
    
    // Update stop_order
    return ordered.map((stop, idx) => ({
      ...stop,
      stop_order: idx + 1
    }));
  }
}

class GoogleRoutingProvider extends RoutingProvider {
  getName() {
    return 'google';
  }

  async calculateStopETAs(stops, originCoords) {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY not configured');
    }
    throw new Error('Google Routing not implemented yet');
  }

  async optimizeStopSequence(stops, originCoords) {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY not configured');
    }
    throw new Error('Google Routing not implemented yet');
  }
}

class GeoapifyRoutingProvider extends RoutingProvider {
  getName() {
    return 'geoapify';
  }

  async calculateStopETAs(stops, originCoords) {
    if (!process.env.GEOAPIFY_API_KEY) {
      throw new Error('GEOAPIFY_API_KEY not configured');
    }
    throw new Error('Geoapify Routing not implemented yet');
  }

  async optimizeStopSequence(stops, originCoords) {
    if (!process.env.GEOAPIFY_API_KEY) {
      throw new Error('GEOAPIFY_API_KEY not configured');
    }
    throw new Error('Geoapify Routing not implemented yet');
  }
}

function getRoutingProvider() {
  const providerName = process.env.ROUTING_PROVIDER || 'heuristic';
  
  if (providerName === 'google') {
    return new GoogleRoutingProvider();
  } else if (providerName === 'geoapify') {
    return new GeoapifyRoutingProvider();
  }
  
  return new HeuristicRoutingProvider();
}

/**
 * Convenience wrapper for calculateStopETAs with automatic fallback
 */
async function calculateStopETAs(stops, originCoords) {
  let provider = getRoutingProvider();
  try {
    return await provider.calculateStopETAs(stops, originCoords);
  } catch (err) {
    console.warn(`[RoutePlanner] ${provider.getName()} failed: ${err.message}. Falling back to heuristic.`);
    provider = new HeuristicRoutingProvider();
    return await provider.calculateStopETAs(stops, originCoords);
  }
}

/**
 * Convenience wrapper for optimizeStopSequence with automatic fallback
 */
async function optimizeStopSequence(stops, originCoords) {
  let provider = getRoutingProvider();
  try {
    return await provider.optimizeStopSequence(stops, originCoords);
  } catch (err) {
    console.warn(`[RoutePlanner] ${provider.getName()} failed: ${err.message}. Falling back to heuristic.`);
    provider = new HeuristicRoutingProvider();
    return await provider.optimizeStopSequence(stops, originCoords);
  }
}

module.exports = {
  getRoutingProvider,
  calculateStopETAs,
  optimizeStopSequence,
  RoutingProvider,
  HeuristicRoutingProvider,
  GoogleRoutingProvider,
  GeoapifyRoutingProvider
};
