let isWalkActive = false;
let walkStartTime = null;
let currentWalkId = null;
let walkCoordinates = [];
let watchId = null;

export async function startWalk(walksLayer, location) {
  // If location provided, use it, else fallback to geolocation
  const getPoint = () => {
    if (location) {
      return Promise.resolve(location);
    }
    if (!navigator.geolocation) {
      return Promise.reject(new Error("Geolocation not supported."));
    }
    return new Promise((resolve, reject) => {
      const geoOptions = { timeout: 10000 };
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            type: "point",
            x: pos.coords.longitude,
            y: pos.coords.latitude,
            spatialReference: { wkid: 4326 }
          });
        },
        (err) => reject(err),
        geoOptions
      );
    });
  };

  try {
    const pointGeometry = await getPoint();

    const startTime = new Date();

    const walkFeature = {
      geometry: pointGeometry,
      attributes: {
        StartTime: startTime.toISOString(),
        EndTime: null,
        UserNotes: ""
      }
    };

    const result = await walksLayer.applyEdits({ addFeatures: [walkFeature] });
    console.log('StartWalk applyEdits result:', result);

    const addedId = result.addFeatureResults[0].objectId;
    currentWalkId = addedId;

    if (addedId !== -1) {
      const query = walksLayer.createQuery();
      query.objectIds = [addedId];
      const { features } = await walksLayer.queryFeatures(query);

      if (features.length) {
        console.log("Queried added walk feature:", features[0]);
        const walkGeometry = features[0].geometry;

        if (window.view && typeof window.view.goTo === "function") {
          window.view.goTo(walkGeometry);
        } else {
          console.warn("window.view.goTo is not available.");
        }
      } else {
        console.warn("No feature returned for added walk ID.");
      }
    } else {
      console.error("Feature add failed: Invalid ObjectID (-1).");
      throw new Error("Invalid ObjectID returned from addFeatures.");
    }

    isWalkActive = true;
    walkStartTime = startTime;

    updateWalkUI();
    closeWalkModal();

  } catch (err) {
    alert("Failed to start walk: " + err.message);
    throw err;
  }
}

/**
 * Ends the current walk: resets state,
 * clears UI fields and updates UI accordingly.
 */
export async function endWalk(walksLayer, notes = "") {
  if (!currentWalkId) {
    alert("No active walk to end.");
    return;
  }

  try {
    const endTime = new Date();

    // Optionally stop geolocation tracking (if you were still using it)
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    const updateFeature = {
      attributes: {
        // Use correct capitalization for ObjectID to identify the feature
        ObjectID: currentWalkId,
        EndTime: endTime.toISOString(),
        UserNotes: notes
      }
    };

    const result = await walksLayer.applyEdits({ updateFeatures: [updateFeature] });
    console.log("EndWalk applyEdits result:", result);

    // Reset state
    isWalkActive = false;
    walkStartTime = null;
    currentWalkId = null;
    walkCoordinates = [];

    // Update UI
    updateWalkUI();
    closeWalkModal();
  } catch (err) {
    alert("Failed to end walk: " + err.message);
  }
}

/**
 * Updates UI elements outside the modal:
 * - Shows/hides Add Flower button
 * - Updates walk status banner text and color
 */
export function updateWalkUI() {
  const flowerBtn = document.getElementById("addFlowerBtn");
  if (flowerBtn) {
    flowerBtn.style.display = isWalkActive ? "inline-block" : "none";
    flowerBtn.disabled = !isWalkActive;
  }

  const banner = document.getElementById("walkStatusBanner");
  if (banner) {
    banner.textContent = isWalkActive ? "Walk Active" : "No Active Walk";
    banner.style.backgroundColor = isWalkActive ? "#4CAF50" : "#5A0000";
  }
}

// Closes the walk modal dialog
export function closeWalkModal() {
  const modal = document.getElementById("walkModal");
  if (modal) modal.style.display = "none";
}

// Opens the walk modal dialog
export function showWalkModal() {
  const modal = document.getElementById("walkModal");
  if (modal) modal.style.display = "block";
  updateWalkUI();
}

// Check if a walk is in progress
export function isWalkInProgress() {
  return isWalkActive;
}

// Get the current walk ID
export function getCurrentWalkId() {
  return currentWalkId;
}