// imports
import {
    startWalk,
    endWalk,
    closeWalkModal,
    showWalkModal,
    isWalkInProgress,
    getCurrentWalkId
} from "./walkTracker.js";

// This is the main JavaScript file for the Flower Recall application
document.addEventListener("DOMContentLoaded", function () {
    let selectingLocation = false;
    let selectedPoint = null;
    let currentWalkId = null;
    let walkNotes = "";
    let walkStartTime = null;
    let flowerLayer, walksLayer;
    let saveNotesBtn = null;
    let notesEl = null;
    let lastSavedNotes = "";

    // Helper to disable Save button
    function disableSaveNotesBtn() {
        if (saveNotesBtn) {
            saveNotesBtn.disabled = true;
            saveNotesBtn.style.opacity = "0.6";
            saveNotesBtn.style.cursor = "default";
        }
    }

    require([
        "esri/config",
        "esri/Map",
        "esri/views/MapView",
        "esri/widgets/Locate",
        "esri/layers/FeatureLayer",
        "esri/Graphic",
        "esri/layers/GraphicsLayer"
    ], (
        esriConfig,
        Map,
        MapView,
        Locate,
        FeatureLayer,
        Graphic,
        GraphicsLayer
    ) => {
        esriConfig.apiKey = "AAPTxy8BH1VEsoebNVZXo8HurA7KuWFcKWHkeJGoN8LUQ0kg89t8Mp9cvPVKOEIlsdPNLfXn5b7CCVz-TOsYcUlMoSeMzi8wk5dok7tlJEH1AT1D08Fi4R08Yc-PqHpmdRfewyDZ3eKIjCxRy2ypQ7t_XLIUEo5TrWCxuzoL-CiULHI9PILuzJZ9AY1270cOvy30f3K9Jl_RnHOWwK1AQpkEKmKK3fbIhSplvXWfswyP60ZOP7jizaZoFHiwlIPf7-kQAT1_oy0SXwjE";

        const map = new Map({ basemap: "satellite" });

        const view = new MapView({
            container: "viewDiv",
            map: map,
            center: [-95.91652, 41.23425],
            zoom: 20
        });

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userCoords = {
                        longitude: position.coords.longitude,
                        latitude: position.coords.latitude
                    };
                    console.log("Panning map to user location:", userCoords);
                    view.goTo({
                        center: [userCoords.longitude, userCoords.latitude],
                        zoom: 20
                    });
                },
                (error) => {
                    console.warn("Geolocation failed or permission denied, using default location.");
                },
                { timeout: 10000 }
            );
        } else {
            console.warn("Geolocation not supported by this browser.");
            // No geolocation, stay at default center
        }

        // Expose Graphic globally
        window.__Graphic = Graphic;

        // Add walk line layer
        const walkLineLayer = new GraphicsLayer();
        window.__walkLineLayer = walkLineLayer;
        map.add(walkLineLayer);

        // Add Locate widget to the view
        const locateWidget = new Locate({ view: view });
        view.ui.add(locateWidget, "top-left");

        // Add feature layers for flowers and walks
        flowerLayer = new FeatureLayer({
            url: "https://services.arcgis.com/HRPe58bUyBqyyiCt/arcgis/rest/services/flower_recall_feature_layer_template/FeatureServer/0",
            title: "FlowerRecall",
            outFields: ["*"]
        });
        flowerLayer.renderer = {
            type: "simple",
            symbol: {
                type: "simple-marker",
                style: "circle",
                color: "red",
                size: 8,
                outline: { color: "black", width: 1 }
            }
        };
        flowerLayer.popupTemplate = {
            title: "Flower Details",
            content: [
                {
                    type: "fields",
                    fieldInfos: [
                        { fieldName: "Notes", label: "Notes" },
                        {
                            fieldName: "Timestamp",
                            label: "Timestamp",
                            format: { dateFormat: "short-date-short-time" }
                        },
                        {
                            fieldName: "PhotoURL",
                            label: "Photo",
                            visible: true
                        }
                    ]
                }
            ]
        };
        map.add(flowerLayer);

        walksLayer = new FeatureLayer({
            url: "https://services.arcgis.com/HRPe58bUyBqyyiCt/arcgis/rest/services/walks_feature_layer_template/FeatureServer/0",
            title: "Walks"
        });
        walksLayer.renderer = {
            type: "simple",
            symbol: {
                type: "simple-marker",
                style: "x",
                color: "black",
                size: 14,
                outline: { color: "blue", width: 1 }
            }
        };
        map.add(walksLayer);

        async function drawWalkLineForCurrentWalk() {
            const walkId = getCurrentWalkId();
            if (!walkId || !flowerLayer || !walksLayer || !window.__walkLineLayer) return;

            try {
                // Query flowers for this walk ordered by timestamp
                const flowerQuery = flowerLayer.createQuery();
                flowerQuery.where = `WalkID = ${walkId}`;
                flowerQuery.returnGeometry = true;
                flowerQuery.outFields = ["Timestamp"];
                flowerQuery.orderByFields = ["Timestamp ASC"];
                const flowerResult = await flowerLayer.queryFeatures(flowerQuery);

                if (!flowerResult.features.length) {
                    console.log("No flower points to draw line.");
                    return;
                }

                // Query the walk start point geometry
                const walkQuery = walksLayer.createQuery();
                walkQuery.objectIds = [walkId];
                walkQuery.returnGeometry = true;
                const walkResult = await walksLayer.queryFeatures(walkQuery);

                // ===== Add debug prints here =====
                console.log("Walk start geometry:", walkResult.features[0].geometry);
                console.log("Walk start spatialReference:", walkResult.features[0].geometry.spatialReference);

                console.log("First flower geometry:", flowerResult.features[0].geometry);
                console.log("First flower spatialReference:", flowerResult.features[0].geometry.spatialReference);

                console.log("Walk start geometry coords:", {
                    x: walkResult.features[0].geometry.x,
                    y: walkResult.features[0].geometry.y,
                    spatialReference: walkResult.features[0].geometry.spatialReference
                });

                console.log("First flower geometry coords:", {
                    x: flowerResult.features[0].geometry.x,
                    y: flowerResult.features[0].geometry.y,
                    spatialReference: flowerResult.features[0].geometry.spatialReference
                });

                if (!walkResult.features.length) {
                    console.log("No walk start location found.");
                    return;
                }

                const startGeometry = walkResult.features[0].geometry;
                const paths = [];

                // Add start point coordinate
                if (startGeometry && typeof startGeometry.x === "number" && typeof startGeometry.y === "number") {
                    paths.push([startGeometry.x, startGeometry.y]);
                }

                // Add flower points
                flowerResult.features.forEach(f => {
                    const { x, y } = f.geometry;
                    paths.push([x, y]);
                });

                if (paths.length < 2) {
                    console.log("Not enough points to draw a line.");
                    return;
                }

                // Create polyline geometry
                const lineGeometry = {
                    type: "polyline",
                    paths: [paths],
                    spatialReference: { wkid: 3857 }  // adjust if needed
                };

                // Line symbol styling
                const lineSymbol = {
                    type: "simple-line",
                    color: [0, 128, 255, 0.9],
                    width: 3
                };

                // Create and add graphic
                const polylineGraphic = new Graphic({
                    geometry: lineGeometry,
                    symbol: lineSymbol
                });

                window.__walkLineLayer.removeAll();
                window.__walkLineLayer.add(polylineGraphic);
                console.log("Walk line drawn from start to flowers.");
            } catch (err) {
                console.error("Error drawing walk line:", err);
            }
        }

        // Expose it globally if you want to call it from outside
        window.drawWalkLineForCurrentWalk = drawWalkLineForCurrentWalk;

        notesEl = document.getElementById("walkNotes");
        saveNotesBtn = document.getElementById("saveWalkNotesBtn");

        if (notesEl && saveNotesBtn) {
            // Initially disable save button
            disableSaveNotesBtn();

            // Enable Save button only if notes have changed compared to lastSavedNotes
            notesEl.addEventListener("input", (e) => {
                walkNotes = e.target.value;
                const trimmedNotes = walkNotes.trim();

                if (saveNotesBtn) {
                    if (trimmedNotes !== "" && trimmedNotes !== lastSavedNotes) {
                        saveNotesBtn.style.display = "inline-block";
                        saveNotesBtn.disabled = false;
                        saveNotesBtn.classList.add("save-notes-btn-enabled");
                        saveNotesBtn.classList.remove("save-notes-btn-disabled");
                    } else {
                        saveNotesBtn.style.display = "none"; // or keep visible & disable if preferred
                        saveNotesBtn.disabled = true;
                        saveNotesBtn.classList.remove("save-notes-btn-enabled");
                        saveNotesBtn.classList.add("save-notes-btn-disabled");
                    }
                }
            });
        }

        if (saveNotesBtn) {
            saveNotesBtn.addEventListener("click", async () => {
                if (!isWalkInProgress()) {
                    alert("No active walk to save notes.");
                    return;
                }
                try {
                    const walkId = getCurrentWalkId();
                    const notesToSave = document.getElementById("walkNotes").value;

                    console.log("Attempting to save notes", { walkId, notesToSave });

                    // Apply edits to update UserNotes attribute
                    const updateFeature = {
                        attributes: {
                            ObjectID: walkId,      // Capital O and ID for ArcGIS ObjectID
                            UserNotes: notesToSave
                        }
                    };

                    console.log("Update feature payload:", updateFeature);

                    const result = await walksLayer.applyEdits({ updateFeatures: [updateFeature] });

                    console.log("applyEdits result:", result);
                    console.log("Update feature result detail:", result.updateFeatureResults[0]);

                    if (result.updateFeatureResults && result.updateFeatureResults.length > 0 && result.updateFeatureResults[0].objectId !== -1) {
                        walkNotes = notesToSave;
                        // Update last saved notes here
                        lastSavedNotes = notesToSave;
                        alert("Notes saved!");
                        // Disable save button after successful save
                        disableSaveNotesBtn();
                    } else {
                        alert("Failed to save notes.");
                    }
                } catch (err) {
                    alert("Error saving notes: " + err.message);
                }
            });
        }

        document.getElementById("startWalkBtn").onclick = async () => {
            showWalkModal();

            const walkId = getCurrentWalkId();
            await loadCurrentWalkData(walksLayer, walkId);
            await filterFlowerLayerByWalkId(walkId);
            updateWalkModal();
        };

        document.getElementById("startWalkBtnModal").onclick = async () => {
            if (isWalkInProgress()) {
                alert("Walk is already active.");
                return;
            }

            let coords;

            try {
                coords = await new Promise((resolve, reject) => {
                    if (!navigator.geolocation) {
                        reject(new Error("Geolocation not supported"));
                        return;
                    }
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            resolve({
                                longitude: position.coords.longitude,
                                latitude: position.coords.latitude,
                            });
                        },
                        (err) => reject(err),
                        { timeout: 10000 }
                    );
                });

                console.log("Geolocation success:", coords);
            } catch (error) {
                console.warn("Geolocation failed or denied, falling back to map center");
                coords = {
                    longitude: view.center.longitude,
                    latitude: view.center.latitude,
                };
            }

            try {
                await startWalk(walksLayer, {
                    type: "point",
                    x: coords.longitude,
                    y: coords.latitude,
                    spatialReference: { wkid: 4326 },
                });

                const walkId = getCurrentWalkId();
                await filterFlowerLayerByWalkId(walkId);
                await loadCurrentWalkData(walksLayer, walkId);

                updateWalkStatusBanner();
                updateWalkModal();
                closeWalkModal();

                // Corrected view.goTo call:
                view.goTo({
                    center: [coords.longitude, coords.latitude],
                    zoom: 20,
                });

                alert("Walk started at your current location.");
            } catch (err) {
                alert("Failed to start walk: " + err.message);
            }
        };

        document.getElementById("endWalkBtnModal").onclick = async () => {
            await endWalk(walksLayer, walkNotes);
            flowerLayer.definitionExpression = "1=0"; // clear flowers
            walksLayer.definitionExpression = "1=0"; // clear walks

            // Clear walk line
            if (window.__walkLineLayer) {
                window.__walkLineLayer.removeAll();
            }

            updateWalkStatusBanner();
            updateWalkModal();
            closeWalkModal();
        };

        document.querySelector("#flowerModal .close").addEventListener("click", () => {
            window.closeFlowerModal();
        });

        document.getElementById("submitFlowerBtn").addEventListener("click", (e) => {
            e.preventDefault();
            window.submitFlower();
        });

        document.getElementById("closeWalkBtnModal").onclick = () => {
            closeWalkModal();
        };

        // Add Flower button click
        document.getElementById("addFlowerBtn").onclick = () => {
            if (!isWalkInProgress()) {
                alert("You can only add flowers during an active walk.");
                return;
            }
            selectingLocation = true;
            view.container.style.cursor = "crosshair";
            alert("Click on the map to select flower location");
        };

        // Map click for flower location
        view.on("click", async (event) => {
            if (selectingLocation) {
                // Selecting flower location mode
                window.selectedPoint = event.mapPoint;
                selectingLocation = false;
                view.container.style.cursor = "default";

                document.getElementById("flowerModal").style.display = "block";
                console.log("Selected flower location:", window.selectedPoint.longitude, window.selectedPoint.latitude);

                // Close popup while selecting flower location
                view.popup.close();
                return;
            }

            try {
                // Limit hitTest to flowerLayer only for performance and accuracy
                const response = await view.hitTest(event, { include: flowerLayer });
                if (response.results.length > 0) {
                    const graphic = response.results[0].graphic;
                    view.popup.open({
                        location: event.mapPoint,
                        features: [graphic]
                    });
                } else {
                    view.popup.close();
                }
            } catch (error) {
                console.error("Error during hitTest:", error);
            }
        });

        // Expose view globally if needed
        window.view = view;

        // Initialize banner on load
        updateWalkStatusBanner();
    });



    function updateWalkStatusBanner() {
        const banner = document.getElementById("walkStatusBanner");
        const walkBtn = document.getElementById("startWalkBtn");
        const addFlowerBtn = document.getElementById("addFlowerBtn");

        if (isWalkInProgress()) {
            banner.textContent = "Walk Active";
            banner.classList.add("active");
            banner.classList.remove("not-active");

            walkBtn.classList.remove("not-active");

            // Enable Add Flower button
            addFlowerBtn.classList.remove("disabled");
            addFlowerBtn.disabled = false;

            // Filter layers to current walk ID
            const walkId = getCurrentWalkId();
            flowerLayer.definitionExpression = `WalkID = ${walkId}`;
            walksLayer.definitionExpression = `ObjectID = ${walkId}`;

        } else {
            banner.textContent = "No Active Walk";
            banner.classList.add("not-active");
            banner.classList.remove("active");

            walkBtn.classList.add("not-active");

            // Disable Add Flower button
            addFlowerBtn.classList.add("disabled");
            addFlowerBtn.disabled = true;

            // Clear filters to show no features
            flowerLayer.definitionExpression = "1=0";
            walksLayer.definitionExpression = "1=0";
        }
    }

    async function loadCurrentWalkData(walksLayer, walkId) {
        if (!walkId) return;
        currentWalkId = walkId;

        try {
            const query = walksLayer.createQuery();
            query.objectIds = [walkId];
            query.returnGeometry = false;
            query.outFields = ["StartTime", "EndTime", "UserNotes"];

            const result = await walksLayer.queryFeatures(query);
            if (result.features.length > 0) {
                const attrs = result.features[0].attributes;
                walkStartTime = attrs.StartTime || null;
                walkNotes = attrs.UserNotes || "";
                lastSavedNotes = walkNotes;
                updateSaveNotesButtonState();

                // When notes loaded, disable Save button until edits
                if (saveNotesBtn) {
                    disableSaveNotesBtn();
                }
            }
        } catch (error) {
            console.error("Failed to load walk data:", error);
        }
    }

    function updateSaveNotesButtonState() {
        if (!saveNotesBtn) return;

        const trimmedNotes = walkNotes.trim();

        if (trimmedNotes !== "" && trimmedNotes !== lastSavedNotes) {
            saveNotesBtn.style.display = "inline-block";
            saveNotesBtn.disabled = false;
            saveNotesBtn.classList.add("save-notes-btn-enabled");
            saveNotesBtn.classList.remove("save-notes-btn-disabled");
        } else {
            saveNotesBtn.style.display = "none"; // or keep it disabled
            saveNotesBtn.disabled = true;
            saveNotesBtn.classList.remove("save-notes-btn-enabled");
            saveNotesBtn.classList.add("save-notes-btn-disabled");
        }
    }

    async function filterFlowerLayerByWalkId(walkId) {
        if (!flowerLayer) {
            console.warn("Flower layer not ready");
            return;
        }
        if (!walkId) {
            console.warn("Invalid walkId for filter");
            flowerLayer.definitionExpression = "1=0";
            walksLayer.definitionExpression = "1=0";
            return;
        }
        flowerLayer.definitionExpression = `WalkID = ${walkId}`;
    }

    function updateWalkModal() {
        const startBtn = document.getElementById("startWalkBtnModal");
        const endBtn = document.getElementById("endWalkBtnModal");
        const walkStatus = document.getElementById("walkStatus");
        const startTimeContainer = document.getElementById("walkStartTimeContainer");
        const startTimeSpan = document.getElementById("walkStartTime");

        if (isWalkInProgress()) {
            startBtn.style.display = "none";
            endBtn.style.display = "inline-block";
            walkStatus.textContent = "Active";
            walkStatus.classList.add("active");

            if (notesEl) {
                notesEl.parentElement.style.display = "block";
                notesEl.value = walkNotes;
            }

            if (startTimeContainer && startTimeSpan) {
                startTimeContainer.style.display = "block";
                startTimeSpan.textContent = walkStartTime
                    ? new Date(walkStartTime).toLocaleString()
                    : "Unknown";
            }

            if (saveNotesBtn) {
                const trimmedNotes = walkNotes.trim();

                // Show and enable only if content is non-empty and has changed
                if (trimmedNotes !== "" && trimmedNotes !== lastSavedNotes) {
                    saveNotesBtn.style.display = "inline-block";
                    saveNotesBtn.disabled = false;
                    saveNotesBtn.classList.add("save-notes-btn-enabled");
                    saveNotesBtn.classList.remove("save-notes-btn-disabled");
                } else {
                    // Optionally hide the button completely
                    saveNotesBtn.style.display = "none";
                    saveNotesBtn.disabled = true;
                    saveNotesBtn.classList.remove("save-notes-btn-enabled");
                    saveNotesBtn.classList.add("save-notes-btn-disabled");
                }
            }
        } else {
            startBtn.style.display = "inline-block";
            endBtn.style.display = "none";
            walkStatus.textContent = "Not Started";
            walkStatus.classList.remove("active");

            if (notesEl) {
                notesEl.parentElement.style.display = "none";
                notesEl.value = "";
            }

            if (startTimeContainer) {
                startTimeContainer.style.display = "none";
            }

            if (saveNotesBtn) {
                saveNotesBtn.style.display = "none";
            }

            walkNotes = "";
        }
    }

    // Flower modal functions (can be moved to your module if preferred)
    window.submitFlower = async function () {
        const photoInput = document.getElementById("photoInput");
        const photoURLInput = photoInput.value.trim();  // original input value
        const notes = document.getElementById("notesInput").value;

        // Validate URL only if provided
        if (photoURLInput && !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)([\?#].*)?$/i.test(photoURLInput)) {
            alert("Please enter a valid image URL (http/https and ends in .jpg, .png, etc).");
            return;
        }

        // Use null if no URL provided
        const photoURL = photoURLInput || null;

        console.log("submitFlower called, selectedPoint =", window.selectedPoint);
        if (!window.selectedPoint) {
            alert("Please select a location on the map.");
            return;
        }

        if (!isWalkInProgress()) {
            alert("No active walk. Please start a walk first.");
            return;
        }

        try {
            // Get current walk ID from walkTracker module
            const walkId = getCurrentWalkId();

            // Build the feature using validated or null photoURL
            const flowerFeature = {
                geometry: {
                    type: "point",
                    longitude: window.selectedPoint.longitude,
                    latitude: window.selectedPoint.latitude
                },
                attributes: {
                    PhotoURL: photoURL,
                    Timestamp: new Date().toISOString(),
                    Notes: notes,
                    IdentificationResult: "",
                    ExternalID: "",
                    WalkID: walkId
                }
            };

            const result = await flowerLayer.applyEdits({ addFeatures: [flowerFeature] });
            if (result.addFeatureResults[0].objectId) {
                alert("Flower added successfully!");
                closeFlowerModal();
                await drawWalkLineForCurrentWalk();
            } else {
                alert("Failed to add flower.");
            }
        } catch (err) {
            alert("Error adding flower: " + err.message);
        }
    };

    window.closeFlowerModal = function () {
        document.getElementById("flowerModal").style.display = "none";
        window.selectedPoint = null;

        // Clear inputs for next time
        const photoInput = document.getElementById("photoInput");
        const notesInput = document.getElementById("notesInput");

        if (photoInput) photoInput.value = "";
        if (notesInput) notesInput.value = "";
    };

});