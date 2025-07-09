import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import * as turf from "@turf/turf";
import * as geojsonValidation from "geojson-validation";
import { z } from "zod";
import toast from "react-hot-toast";

const GOOGLE_MAP_API_KEY = process.env.REACT_APP_GOOGLEAPI;
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

const ZoneManager = () => {
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const fileInputRef = useRef(null);
  const zoneOverlaysRef = useRef([]); // ✅ Track zone overlays for cleanup

  const wsRef = useRef(null);
  const [wsStatus, setWsStatus] = useState("Disconnected");

  const [mapLoaded, setMapLoaded] = useState(false);
  const [zones, setZones] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [assetPosition, setAssetPosition] = useState({
    lat: 40.7825,
    lng: -73.965,
  });
  const [inZone, setInZone] = useState(false);
  const [eventLog, setEventLog] = useState([]);

  const LatLngSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  });

  // ✅ Clear existing zone overlays from map
  const clearZoneOverlays = () => {
    zoneOverlaysRef.current.forEach((overlay) => {
      overlay.setMap(null);
    });
    zoneOverlaysRef.current = [];
  };

  useEffect(() => {
    if (!window.google && !document.getElementById("google-maps-script")) {
      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAP_API_KEY}&libraries=drawing`;
      script.async = true;
      script.defer = true;
      script.onload = () => setMapLoaded(true);
      document.body.appendChild(script);
    } else {
      setMapLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (mapLoaded) initMap();
  }, [mapLoaded]);

  const initMap = () => {
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 40.7829, lng: -73.9654 },
      zoom: 15,
    });
    mapInstanceRef.current = map;

    const drawingManager = new window.google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: true,
      drawingControlOptions: {
        position: window.google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [
          window.google.maps.drawing.OverlayType.POLYGON,
          window.google.maps.drawing.OverlayType.POLYLINE,
          window.google.maps.drawing.OverlayType.CIRCLE,
          window.google.maps.drawing.OverlayType.RECTANGLE,
        ],
      },
      polygonOptions: {
        fillColor: "#2196F3",
        fillOpacity: 0.4,
        strokeWeight: 2,
        clickable: true,
        editable: false,
        zIndex: 1,
      },
      polylineOptions: {
        strokeColor: "#2196F3",
        strokeWeight: 2,
        clickable: true,
        editable: false,
        zIndex: 1,
      },
      rectangleOptions: {
        fillColor: "#2196F3",
        fillOpacity: 0.4,
        strokeWeight: 2,
        clickable: true,
        editable: false,
        zIndex: 1,
      },
      circleOptions: {
        fillColor: "#2196F3",
        fillOpacity: 0.4,
        strokeWeight: 2,
        clickable: true,
        editable: false,
        zIndex: 1,
      },
    });

    drawingManager.setMap(map);

    window.google.maps.event.addListener(
      drawingManager,
      "overlaycomplete",
      async (event) => {
        let geojson;
        let name = prompt("Enter Zone Name");
        if (!name || name.trim() === "") {
          alert("Zone name cannot be empty.");
          event.overlay.setMap(null);
          return;
        }

        switch (event.type) {
          case "polygon": {
            const polygon = event.overlay;
            const path = polygon.getPath().getArray();
            if (path.length < 3) {
              alert("Polygon must have at least 3 points.");
              polygon.setMap(null);
              return;
            }
            let coordinates = path.map((latLng) => [
              latLng.lng(),
              latLng.lat(),
            ]);
            coordinates.push(coordinates[0]); // close polygon

            geojson = {
              type: "Polygon",
              coordinates: [coordinates],
            };
            break;
          }

          case "polyline": {
            const polyline = event.overlay;
            const path = polyline.getPath().getArray();
            if (path.length < 2) {
              alert("Line must have at least 2 points.");
              polyline.setMap(null);
              return;
            }
            const coordinates = path.map((latLng) => [
              latLng.lng(),
              latLng.lat(),
            ]);

            geojson = {
              type: "LineString",
              coordinates,
            };
            break;
          }

          case "circle": {
            const circle = event.overlay;
            const center = circle.getCenter();
            const radius = circle.getRadius();

            const points = [];
            const numPoints = 64;
            for (let i = 0; i < numPoints; i++) {
              const angle = (i / numPoints) * 2 * Math.PI;
              const point = turf.destination(
                turf.point([center.lng(), center.lat()]),
                radius / 1000,
                (angle * 180) / Math.PI,
                { units: "kilometers" }
              );
              points.push(point.geometry.coordinates);
            }
            points.push(points[0]);

            geojson = {
              type: "Polygon",
              coordinates: [points],
            };
            break;
          }

          case "rectangle": {
            const rectangle = event.overlay;
            const bounds = rectangle.getBounds();
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            const nw = new window.google.maps.LatLng(ne.lat(), sw.lng());
            const se = new window.google.maps.LatLng(sw.lat(), ne.lng());

            const coordinates = [
              [sw.lng(), sw.lat()],
              [nw.lng(), nw.lat()],
              [ne.lng(), ne.lat()],
              [se.lng(), se.lat()],
              [sw.lng(), sw.lat()],
            ];

            geojson = {
              type: "Polygon",
              coordinates: [coordinates],
            };
            break;
          }

          default:
            alert("Unsupported shape type");
            event.overlay.setMap(null);
            return;
        }

        if (
          (geojson.type === "Polygon" &&
            !geojsonValidation.isPolygon(geojson)) ||
          (geojson.type === "LineString" &&
            !geojsonValidation.isLineString(geojson))
        ) {
          alert("Invalid GeoJSON shape. Please try again.");
          event.overlay.setMap(null);
          return;
        }

        // ✅ Remove the overlay from drawing manager (it will be redrawn by loadZones)
        event.overlay.setMap(null);

        await saveZone(name.trim(), geojson);
      }
    );

    loadZones(map);
  };

  const saveZone = async (name, geojson) => {
    try {
      const res = await fetch(apiUrl("/zone"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, geojson }),
      });

      const result = await res.json();

      if (res.ok) {
        console.log("Zone saved:", name);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              action: "default",
              type: "zone-update",
              zoneName: name,
            })
          );
        }

        // ✅ Show toast
        toast.success("Zone added successfully!");
      } else {
        throw new Error(result.error || "Failed to save zone");
      }
    } catch (err) {
      console.error("Failed to save zone:", err);
      toast.error("❌ Failed to save zone.");
    }
  };

  const loadZones = async (mapInstance) => {
    try {
      const res = await fetch(apiUrl("/zones"));
      const data = await res.json();
      setZones(data);

      const map = mapInstance || mapInstanceRef.current;
      if (!map) return;

      // ✅ Clear existing zone overlays before adding new ones
      clearZoneOverlays();

      // ✅ Add new zone overlays
      data.forEach((zone) => {
        let overlay;

        if (zone.geojson.type === "Polygon") {
          overlay = new window.google.maps.Polygon({
            paths: zone.geojson.coordinates[0].map(([lng, lat]) => ({
              lat,
              lng,
            })),
            strokeColor: "#FF0000",
            strokeOpacity: 1,
            strokeWeight: 2,
            fillColor: "#FF0000",
            fillOpacity: 0.2,
          });
        } else if (zone.geojson.type === "LineString") {
          overlay = new window.google.maps.Polyline({
            path: zone.geojson.coordinates.map(([lng, lat]) => ({
              lat,
              lng,
            })),
            strokeColor: "#FF0000",
            strokeOpacity: 1,
            strokeWeight: 2,
          });
        }

        if (overlay) {
          overlay.setMap(map);
          zoneOverlaysRef.current.push(overlay); // ✅ Track for cleanup
        }
      });
    } catch (err) {
      console.error("Failed to load zones:", err);
    }
  };

  const sendEmailAlert = async (eventType, zone, point) => {
    const body = {
      type: eventType,
      zoneId: zone.id,
      zoneName: zone.name,
      geojson: zone.geojson,
      point,
      timestamp: new Date().toISOString(),
    };

    try {
      await fetch(apiUrl("/alert"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      console.log("✅ Email alert sent:", body);
    } catch (err) {
      console.error("Failed to send email alert:", err);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(apiUrl(`/zone/${id}`), { method: "DELETE" });

      if (!res.ok) throw new Error("Failed to delete");

      // ✅ WebSocket broadcast
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            action: "default",
            type: "zone-delete",
            zoneId: id,
          })
        );
      }

      // ✅ Update UI state
      setZones((prev) => prev.filter((z) => z.id !== id));
      loadZones();

      // ✅ Show toast
      toast.success("✅ Zone deleted successfully");
    } catch (err) {
      console.error("❌ Delete error:", err);
      toast.error("❌ Failed to delete zone");
    }
  };

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let file of files) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);

        if (
          !geojsonValidation.isPolygon(json) &&
          !geojsonValidation.isMultiPolygon(json) &&
          !geojsonValidation.isLineString(json)
        ) {
          setUploadStatus(
            `❌ Invalid GeoJSON in ${file.name}: Only Polygon, MultiPolygon, or LineString supported.`
          );
          continue;
        }

        const name =
          prompt(`Enter a name for zone in ${file.name}`) ||
          file.name.replace(".geojson", "");
        if (!name || name.trim() === "") {
          alert("Zone name is required. Skipping " + file.name);
          continue;
        }

        await saveZone(name.trim(), json);
        setUploadStatus(`✅ Zone uploaded: ${name.trim()}`);
      } catch (err) {
        console.error(err);
        setUploadStatus(`❌ Error reading or uploading ${file.name}.`);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Asset movement and geofencing logic
  useEffect(() => {
    if (!mapLoaded || zones.length === 0 || !mapInstanceRef.current) return;

    const interval = setInterval(() => {
      const deltaLat = (Math.random() - 0.5) * 0.0005;
      const deltaLng = (Math.random() - 0.5) * 0.0005;

      setAssetPosition((prev) => {
        const newPos = {
          lat: prev.lat + deltaLat,
          lng: prev.lng + deltaLng,
        };

        try {
          LatLngSchema.parse(newPos);
        } catch (err) {
          console.warn("Invalid coordinates, skipping...");
          return prev;
        }

        const point = turf.point([newPos.lng, newPos.lat]);
        let inside = false;
        let matchedZone = null;

        for (let zone of zones) {
          if (zone.geojson.type === "Polygon") {
            const polygon = turf.polygon(zone.geojson.coordinates);
            if (turf.booleanPointInPolygon(point, polygon)) {
              inside = true;
              matchedZone = zone;
              break;
            }
          }
        }

        const timestamp = new Date().toLocaleString();

        if (inside && !inZone) {
          setInZone(true);
          setEventLog((prev) => [
            { type: "Entered", zone: matchedZone.name, time: timestamp },
            ...prev,
          ]);
          sendEmailAlert("ENTER", matchedZone, point);
        } else if (!inside && inZone) {
          setInZone(false);
          setEventLog((prev) => [
            {
              type: "Exited",
              zone: matchedZone?.name || "Unknown",
              time: timestamp,
            },
            ...prev,
          ]);
          sendEmailAlert("EXIT", matchedZone || {}, point);
        }

        const map = mapInstanceRef.current;
        if (!markerRef.current) {
          markerRef.current = new window.google.maps.Marker({
            map,
            title: "Asset",
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: inside ? "#0f0" : "#f00",
              fillOpacity: 1,
              strokeWeight: 1,
            },
          });
        }

        markerRef.current.setIcon({
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: inside ? "#0f0" : "#f00",
          fillOpacity: 1,
          strokeWeight: 1,
        });
        markerRef.current.setPosition(
          new window.google.maps.LatLng(newPos.lat, newPos.lng)
        );

        return newPos;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [zones, mapLoaded, inZone]);

  // ✅ Enhanced WebSocket connection with proper message handling
  useEffect(() => {
    const socket = new WebSocket(
      "wss://gzor3mc31j.execute-api.us-east-1.amazonaws.com/$default"
    );
    wsRef.current = socket;

    socket.onopen = () => {
      console.log("✅ WebSocket connected");
      setWsStatus("Connected");
    };

    socket.onclose = () => {
      console.warn("❌ WebSocket disconnected");
      setWsStatus("Disconnected");
    };

    socket.onerror = (err) => {
      console.error("🚨 WebSocket error", err);
      setWsStatus("Error");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📨 WebSocket message received:", data);

        // ✅ Handle different message types
        if (data.type === "zone-update") {
          console.log("🔄 Reloading zones due to update...");
          loadZones(); // This will clear and reload all zones
        } else if (data.type === "zone-delete") {
          console.log("🗑️ Reloading zones due to deletion...");
          loadZones(); // Reload zones after deletion
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  // ✅ Cleanup function to clear overlays when component unmounts
  useEffect(() => {
    return () => {
      clearZoneOverlays();
    };
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Zone Manager
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Typography
          variant="caption"
          color={wsStatus === "Connected" ? "success.main" : "error.main"}
        >
          WebSocket: {wsStatus}
        </Typography>
      </Box>

      <Box
        ref={mapRef}
        style={{ width: "100%", height: "500px", marginBottom: "24px" }}
      />

      <Box sx={{ mb: 3 }}>
        <Typography variant="h6">📂 Upload GeoJSON Zone</Typography>
        <input
          type="file"
          ref={fileInputRef}
          accept=".geojson,application/geo+json"
          onChange={handleFileUpload}
          multiple
          style={{ marginBottom: "8px" }}
        />
        {uploadStatus && (
          <Typography
            variant="body2"
            color={
              uploadStatus.startsWith("✅") ? "success.main" : "error.main"
            }
          >
            {uploadStatus}
          </Typography>
        )}
      </Box>

      <Divider sx={{ my: 3 }} />
      <Box>
        <Typography variant="h6">🗂️ Saved Zones ({zones.length})</Typography>

        {zones.length === 0 ? (
          <Typography>
            No zones available. Draw zones on the map or upload GeoJSON files.
          </Typography>
        ) : (
          zones.map((zone) => (
            <Box
              key={zone.id}
              sx={{
                mb: 1,
                p: 1,
                border: 1,
                borderColor: "grey.300",
                borderRadius: 1,
              }}
            >
              <Typography variant="body1">{zone.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                Type: {zone.geojson.type}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={() => handleDelete(zone.id)}
                >
                  Delete Zone
                </Button>
              </Box>
            </Box>
          ))
        )}
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box>
        <Typography variant="h6">🕒 Entry/Exit Log</Typography>
        {eventLog.length === 0 ? (
          <Typography>
            No events yet. Asset movement will be logged here.
          </Typography>
        ) : (
          <List>
            {eventLog.slice(0, 10).map((log, idx) => (
              <ListItem key={idx} sx={{ py: 0.5 }}>
                <ListItemText
                  primary={`${log.type} - ${log.zone}`}
                  secondary={log.time}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
};

export default ZoneManager;

// import React, { useEffect, useRef, useState } from "react";
// import {
//   Box,
//   Typography,
//   Button,
//   Divider,
//   List,
//   ListItem,
//   ListItemText,
// } from "@mui/material";
// import * as turf from "@turf/turf";
// import * as geojsonValidation from "geojson-validation";
// import { z } from "zod";
// import toast from "react-hot-toast";

// const GOOGLE_MAP_API_KEY = process.env.REACT_APP_GOOGLEAPI;
// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

// function apiUrl(path) {
//   return `${API_BASE_URL}${path}`;
// }

// const ZoneManager = () => {
//   const mapRef = useRef(null);
//   const markerRef = useRef(null);
//   const mapInstanceRef = useRef(null);
//   const fileInputRef = useRef(null);
//   const zoneOverlaysRef = useRef([]); // ✅ Track zone overlays for cleanup

//   const wsRef = useRef(null);
//   const [wsStatus, setWsStatus] = useState("Disconnected");

//   const [mapLoaded, setMapLoaded] = useState(false);
//   const [zones, setZones] = useState([]);
//   const [uploadStatus, setUploadStatus] = useState("");
//   const [assetPosition, setAssetPosition] = useState({
//     lat: 40.7825,
//     lng: -73.965,
//   });
//   const [inZone, setInZone] = useState(false);
//   const [eventLog, setEventLog] = useState([]);

//   const LatLngSchema = z.object({
//     lat: z.number().min(-90).max(90),
//     lng: z.number().min(-180).max(180),
//   });

//   // ✅ Clear existing zone overlays from map
//   const clearZoneOverlays = () => {
//     zoneOverlaysRef.current.forEach((overlay) => {
//       overlay.setMap(null);
//     });
//     zoneOverlaysRef.current = [];
//   };

//   useEffect(() => {
//     if (!window.google && !document.getElementById("google-maps-script")) {
//       const script = document.createElement("script");
//       script.id = "google-maps-script";
//       script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAP_API_KEY}&libraries=drawing`;
//       script.async = true;
//       script.defer = true;
//       script.onload = () => setMapLoaded(true);
//       document.body.appendChild(script);
//     } else {
//       setMapLoaded(true);
//     }
//   }, []);

//   useEffect(() => {
//     if (mapLoaded) initMap();
//   }, [mapLoaded]);

//   const initMap = () => {
//     const map = new window.google.maps.Map(mapRef.current, {
//       center: { lat: 40.7829, lng: -73.9654 },
//       zoom: 15,
//     });
//     mapInstanceRef.current = map;

//     const drawingManager = new window.google.maps.drawing.DrawingManager({
//       drawingMode: null,
//       drawingControl: true,
//       drawingControlOptions: {
//         position: window.google.maps.ControlPosition.TOP_CENTER,
//         drawingModes: [
//           window.google.maps.drawing.OverlayType.POLYGON,
//           window.google.maps.drawing.OverlayType.POLYLINE,
//           window.google.maps.drawing.OverlayType.CIRCLE,
//           window.google.maps.drawing.OverlayType.RECTANGLE,
//         ],
//       },
//       polygonOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       polylineOptions: {
//         strokeColor: "#2196F3",
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       rectangleOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       circleOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//     });

//     drawingManager.setMap(map);

//     window.google.maps.event.addListener(
//       drawingManager,
//       "overlaycomplete",
//       async (event) => {
//         let geojson;
//         let name = prompt("Enter Zone Name");
//         if (!name || name.trim() === "") {
//           alert("Zone name cannot be empty.");
//           event.overlay.setMap(null);
//           return;
//         }

//         switch (event.type) {
//           case "polygon": {
//             const polygon = event.overlay;
//             const path = polygon.getPath().getArray();
//             if (path.length < 3) {
//               alert("Polygon must have at least 3 points.");
//               polygon.setMap(null);
//               return;
//             }
//             let coordinates = path.map((latLng) => [
//               latLng.lng(),
//               latLng.lat(),
//             ]);
//             coordinates.push(coordinates[0]); // close polygon

//             geojson = {
//               type: "Polygon",
//               coordinates: [coordinates],
//             };
//             break;
//           }

//           case "polyline": {
//             const polyline = event.overlay;
//             const path = polyline.getPath().getArray();
//             if (path.length < 2) {
//               alert("Line must have at least 2 points.");
//               polyline.setMap(null);
//               return;
//             }
//             const coordinates = path.map((latLng) => [
//               latLng.lng(),
//               latLng.lat(),
//             ]);

//             geojson = {
//               type: "LineString",
//               coordinates,
//             };
//             break;
//           }

//           case "circle": {
//             const circle = event.overlay;
//             const center = circle.getCenter();
//             const radius = circle.getRadius();

//             const points = [];
//             const numPoints = 64;
//             for (let i = 0; i < numPoints; i++) {
//               const angle = (i / numPoints) * 2 * Math.PI;
//               const point = turf.destination(
//                 turf.point([center.lng(), center.lat()]),
//                 radius / 1000,
//                 (angle * 180) / Math.PI,
//                 { units: "kilometers" }
//               );
//               points.push(point.geometry.coordinates);
//             }
//             points.push(points[0]);

//             geojson = {
//               type: "Polygon",
//               coordinates: [points],
//             };
//             break;
//           }

//           case "rectangle": {
//             const rectangle = event.overlay;
//             const bounds = rectangle.getBounds();
//             const ne = bounds.getNorthEast();
//             const sw = bounds.getSouthWest();
//             const nw = new window.google.maps.LatLng(ne.lat(), sw.lng());
//             const se = new window.google.maps.LatLng(sw.lat(), ne.lng());

//             const coordinates = [
//               [sw.lng(), sw.lat()],
//               [nw.lng(), nw.lat()],
//               [ne.lng(), ne.lat()],
//               [se.lng(), se.lat()],
//               [sw.lng(), sw.lat()],
//             ];

//             geojson = {
//               type: "Polygon",
//               coordinates: [coordinates],
//             };
//             break;
//           }

//           default:
//             alert("Unsupported shape type");
//             event.overlay.setMap(null);
//             return;
//         }

//         if (
//           (geojson.type === "Polygon" &&
//             !geojsonValidation.isPolygon(geojson)) ||
//           (geojson.type === "LineString" &&
//             !geojsonValidation.isLineString(geojson))
//         ) {
//           alert("Invalid GeoJSON shape. Please try again.");
//           event.overlay.setMap(null);
//           return;
//         }

//         // ✅ Remove the overlay from drawing manager (it will be redrawn by loadZones)
//         event.overlay.setMap(null);

//         await saveZone(name.trim(), geojson);
//       }
//     );

//     loadZones(map);
//   };

//   const saveZone = async (name, geojson) => {
//     try {
//       const res = await fetch(apiUrl("/zone"), {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ name, geojson }),
//       });

//       const result = await res.json();

//       if (res.ok) {
//         console.log("Zone saved:", name);

//         if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
//           wsRef.current.send(
//             JSON.stringify({
//               action: "default",
//               type: "zone-update",
//               zoneName: name,
//             })
//           );
//         }

//         // ✅ Show toast
//         toast.success("Zone added successfully!");
//       } else {
//         throw new Error(result.error || "Failed to save zone");
//       }
//     } catch (err) {
//       console.error("Failed to save zone:", err);
//       toast.error("❌ Failed to save zone.");
//     }
//   };

//   const loadZones = async (mapInstance) => {
//     try {
//       const res = await fetch(apiUrl("/zones"));
//       const data = await res.json();
//       setZones(data);

//       const map = mapInstance || mapInstanceRef.current;
//       if (!map) return;

//       // ✅ Clear existing zone overlays before adding new ones
//       clearZoneOverlays();

//       // ✅ Add new zone overlays
//       data.forEach((zone) => {
//         let overlay;

//         if (zone.geojson.type === "Polygon") {
//           overlay = new window.google.maps.Polygon({
//             paths: zone.geojson.coordinates[0].map(([lng, lat]) => ({
//               lat,
//               lng,
//             })),
//             strokeColor: "#FF0000",
//             strokeOpacity: 1,
//             strokeWeight: 2,
//             fillColor: "#FF0000",
//             fillOpacity: 0.2,
//           });
//         } else if (zone.geojson.type === "LineString") {
//           overlay = new window.google.maps.Polyline({
//             path: zone.geojson.coordinates.map(([lng, lat]) => ({
//               lat,
//               lng,
//             })),
//             strokeColor: "#FF0000",
//             strokeOpacity: 1,
//             strokeWeight: 2,
//           });
//         }

//         if (overlay) {
//           overlay.setMap(map);
//           zoneOverlaysRef.current.push(overlay); // ✅ Track for cleanup
//         }
//       });
//     } catch (err) {
//       console.error("Failed to load zones:", err);
//     }
//   };

//   const sendEmailAlert = async (eventType, zone, point) => {
//     const body = {
//       type: eventType,
//       zoneId: zone.id,
//       zoneName: zone.name,
//       geojson: zone.geojson,
//       point,
//       timestamp: new Date().toISOString(),
//     };

//     try {
//       await fetch(apiUrl("/alert"), {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(body),
//       });
//       console.log("✅ Email alert sent:", body);
//     } catch (err) {
//       console.error("Failed to send email alert:", err);
//     }
//   };

//   const handleDelete = async (id) => {
//     try {
//       await fetch(apiUrl(`/zone/${id}`), { method: "DELETE" });

//       // ✅ Send WebSocket message for deletion
//       if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
//         wsRef.current.send(
//           JSON.stringify({
//             action: "default",
//             type: "zone-delete",
//             zoneId: id,
//           })
//         );
//       }

//       // ✅ Update local state immediately
//       setZones((prev) => prev.filter((z) => z.id !== id));

//       // ✅ Reload zones to update the map
//       loadZones();

//       alert("Zone deleted");
//     } catch (err) {
//       console.error("Failed to delete zone:", err);
//     }
//   };

//   const handleFileUpload = async (event) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;

//     for (let file of files) {
//       try {
//         const text = await file.text();
//         const json = JSON.parse(text);

//         if (
//           !geojsonValidation.isPolygon(json) &&
//           !geojsonValidation.isMultiPolygon(json) &&
//           !geojsonValidation.isLineString(json)
//         ) {
//           setUploadStatus(
//             `❌ Invalid GeoJSON in ${file.name}: Only Polygon, MultiPolygon, or LineString supported.`
//           );
//           continue;
//         }

//         const name =
//           prompt(`Enter a name for zone in ${file.name}`) ||
//           file.name.replace(".geojson", "");
//         if (!name || name.trim() === "") {
//           alert("Zone name is required. Skipping " + file.name);
//           continue;
//         }

//         await saveZone(name.trim(), json);
//         setUploadStatus(`✅ Zone uploaded: ${name.trim()}`);
//       } catch (err) {
//         console.error(err);
//         setUploadStatus(`❌ Error reading or uploading ${file.name}.`);
//       }
//     }

//     if (fileInputRef.current) {
//       fileInputRef.current.value = "";
//     }
//   };

//   // Asset movement and geofencing logic
//   useEffect(() => {
//     if (!mapLoaded || zones.length === 0 || !mapInstanceRef.current) return;

//     const interval = setInterval(() => {
//       const deltaLat = (Math.random() - 0.5) * 0.0005;
//       const deltaLng = (Math.random() - 0.5) * 0.0005;

//       setAssetPosition((prev) => {
//         const newPos = {
//           lat: prev.lat + deltaLat,
//           lng: prev.lng + deltaLng,
//         };

//         try {
//           LatLngSchema.parse(newPos);
//         } catch (err) {
//           console.warn("Invalid coordinates, skipping...");
//           return prev;
//         }

//         const point = turf.point([newPos.lng, newPos.lat]);
//         let inside = false;
//         let matchedZone = null;

//         for (let zone of zones) {
//           if (zone.geojson.type === "Polygon") {
//             const polygon = turf.polygon(zone.geojson.coordinates);
//             if (turf.booleanPointInPolygon(point, polygon)) {
//               inside = true;
//               matchedZone = zone;
//               break;
//             }
//           }
//         }

//         const timestamp = new Date().toLocaleString();

//         if (inside && !inZone) {
//           setInZone(true);
//           setEventLog((prev) => [
//             { type: "Entered", zone: matchedZone.name, time: timestamp },
//             ...prev,
//           ]);
//           sendEmailAlert("ENTER", matchedZone, point);
//         } else if (!inside && inZone) {
//           setInZone(false);
//           setEventLog((prev) => [
//             {
//               type: "Exited",
//               zone: matchedZone?.name || "Unknown",
//               time: timestamp,
//             },
//             ...prev,
//           ]);
//           sendEmailAlert("EXIT", matchedZone || {}, point);
//         }

//         const map = mapInstanceRef.current;
//         if (!markerRef.current) {
//           markerRef.current = new window.google.maps.Marker({
//             map,
//             title: "Asset",
//             icon: {
//               path: window.google.maps.SymbolPath.CIRCLE,
//               scale: 6,
//               fillColor: inside ? "#0f0" : "#f00",
//               fillOpacity: 1,
//               strokeWeight: 1,
//             },
//           });
//         }

//         markerRef.current.setIcon({
//           path: window.google.maps.SymbolPath.CIRCLE,
//           scale: 6,
//           fillColor: inside ? "#0f0" : "#f00",
//           fillOpacity: 1,
//           strokeWeight: 1,
//         });
//         markerRef.current.setPosition(
//           new window.google.maps.LatLng(newPos.lat, newPos.lng)
//         );

//         return newPos;
//       });
//     }, 1000);

//     return () => clearInterval(interval);
//   }, [zones, mapLoaded, inZone]);

//   // ✅ Enhanced WebSocket connection with proper message handling
//   useEffect(() => {
//     const socket = new WebSocket(
//       "wss://gzor3mc31j.execute-api.us-east-1.amazonaws.com/$default"
//     );
//     wsRef.current = socket;

//     socket.onopen = () => {
//       console.log("✅ WebSocket connected");
//       setWsStatus("Connected");
//     };

//     socket.onclose = () => {
//       console.warn("❌ WebSocket disconnected");
//       setWsStatus("Disconnected");
//     };

//     socket.onerror = (err) => {
//       console.error("🚨 WebSocket error", err);
//       setWsStatus("Error");
//     };

//     socket.onmessage = (event) => {
//       try {
//         const data = JSON.parse(event.data);
//         console.log("📨 WebSocket message received:", data);

//         // ✅ Handle different message types
//         if (data.type === "zone-update") {
//           console.log("🔄 Reloading zones due to update...");
//           loadZones(); // This will clear and reload all zones
//         } else if (data.type === "zone-delete") {
//           console.log("🗑️ Reloading zones due to deletion...");
//           loadZones(); // Reload zones after deletion
//         }
//       } catch (err) {
//         console.error("Failed to parse WebSocket message:", err);
//       }
//     };

//     return () => {
//       socket.close();
//     };
//   }, []);

//   // ✅ Cleanup function to clear overlays when component unmounts
//   useEffect(() => {
//     return () => {
//       clearZoneOverlays();
//     };
//   }, []);

//   return (
//     <Box sx={{ p: 3 }}>
//       <Typography variant="h4" gutterBottom>
//         Zone Manager
//       </Typography>

//       <Box sx={{ mb: 2 }}>
//         <Typography
//           variant="caption"
//           color={wsStatus === "Connected" ? "success.main" : "error.main"}
//         >
//           WebSocket: {wsStatus}
//         </Typography>
//       </Box>

//       <Box
//         ref={mapRef}
//         style={{ width: "100%", height: "500px", marginBottom: "24px" }}
//       />

//       <Box sx={{ mb: 3 }}>
//         <Typography variant="h6">📂 Upload GeoJSON Zone</Typography>
//         <input
//           type="file"
//           ref={fileInputRef}
//           accept=".geojson,application/geo+json"
//           onChange={handleFileUpload}
//           multiple
//           style={{ marginBottom: "8px" }}
//         />
//         {uploadStatus && (
//           <Typography
//             variant="body2"
//             color={
//               uploadStatus.startsWith("✅") ? "success.main" : "error.main"
//             }
//           >
//             {uploadStatus}
//           </Typography>
//         )}
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🗂️ Saved Zones ({zones.length})</Typography>
//         {zones.length === 0 ? (
//           <Typography>
//             No zones available. Draw zones on the map or upload GeoJSON files.
//           </Typography>
//         ) : (
//           zones.map((zone) => (
//             <Box
//               key={zone.id}
//               sx={{
//                 mb: 1,
//                 p: 1,
//                 border: 1,
//                 borderColor: "grey.300",
//                 borderRadius: 1,
//               }}
//             >
//               <Typography variant="body1">{zone.name}</Typography>
//               <Typography variant="caption" color="text.secondary">
//                 Type: {zone.geojson.type}
//               </Typography>
//               <Box sx={{ mt: 1 }}>
//                 <Button
//                   variant="outlined"
//                   color="error"
//                   size="small"
//                   onClick={() => handleDelete(zone.id)}
//                 >
//                   Delete Zone
//                 </Button>
//               </Box>
//             </Box>
//           ))
//         )}
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🕒 Entry/Exit Log</Typography>
//         {eventLog.length === 0 ? (
//           <Typography>
//             No events yet. Asset movement will be logged here.
//           </Typography>
//         ) : (
//           <List>
//             {eventLog.slice(0, 10).map((log, idx) => (
//               <ListItem key={idx} sx={{ py: 0.5 }}>
//                 <ListItemText
//                   primary={`${log.type} - ${log.zone}`}
//                   secondary={log.time}
//                 />
//               </ListItem>
//             ))}
//           </List>
//         )}
//       </Box>
//     </Box>
//   );
// };

// export default ZoneManager;

// import React, { useEffect, useRef, useState } from "react";
// import {
//   Box,
//   Typography,
//   Button,
//   Divider,
//   List,
//   ListItem,
//   ListItemText,
// } from "@mui/material";
// import * as turf from "@turf/turf";
// import * as geojsonValidation from "geojson-validation";
// import { z } from "zod";

// const GOOGLE_MAP_API_KEY = process.env.REACT_APP_GOOGLEAPI;
// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

// function apiUrl(path) {
//   return `${API_BASE_URL}${path}`;
// }

// const ZoneManager = () => {
//   const mapRef = useRef(null);
//   const markerRef = useRef(null);
//   const mapInstanceRef = useRef(null);
//   const fileInputRef = useRef(null);

//   // Fixed WebSocket ref - removed invalid syntax
//   const wsRef = useRef(null);
//   const [wsStatus, setWsStatus] = useState("Disconnected");

//   const [mapLoaded, setMapLoaded] = useState(false);
//   const [zones, setZones] = useState([]);
//   const [uploadStatus, setUploadStatus] = useState("");
//   const [assetPosition, setAssetPosition] = useState({
//     lat: 40.7825,
//     lng: -73.965,
//   });
//   const [inZone, setInZone] = useState(false);
//   const [eventLog, setEventLog] = useState([]);

//   const LatLngSchema = z.object({
//     lat: z.number().min(-90).max(90),
//     lng: z.number().min(-180).max(180),
//   });

//   useEffect(() => {
//     if (!window.google && !document.getElementById("google-maps-script")) {
//       const script = document.createElement("script");
//       script.id = "google-maps-script";
//       script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAP_API_KEY}&libraries=drawing`;
//       script.async = true;
//       script.defer = true;
//       script.onload = () => setMapLoaded(true);
//       document.body.appendChild(script);
//     } else {
//       setMapLoaded(true);
//     }
//   }, []);

//   useEffect(() => {
//     if (mapLoaded) initMap();
//   }, [mapLoaded]);

//   const initMap = () => {
//     const map = new window.google.maps.Map(mapRef.current, {
//       center: { lat: 40.7829, lng: -73.9654 },
//       zoom: 15,
//     });
//     mapInstanceRef.current = map;

//     const drawingManager = new window.google.maps.drawing.DrawingManager({
//       drawingMode: null,
//       drawingControl: true,
//       drawingControlOptions: {
//         position: window.google.maps.ControlPosition.TOP_CENTER,
//         drawingModes: [
//           window.google.maps.drawing.OverlayType.POLYGON,
//           window.google.maps.drawing.OverlayType.POLYLINE,
//           window.google.maps.drawing.OverlayType.CIRCLE,
//           window.google.maps.drawing.OverlayType.RECTANGLE,
//         ],
//       },
//       polygonOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       polylineOptions: {
//         strokeColor: "#2196F3",
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       rectangleOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       circleOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//     });

//     drawingManager.setMap(map);

//     window.google.maps.event.addListener(
//       drawingManager,
//       "overlaycomplete",
//       async (event) => {
//         let geojson;
//         let name = prompt("Enter Zone Name");
//         if (!name || name.trim() === "") {
//           alert("Zone name cannot be empty.");
//           event.overlay.setMap(null);
//           return;
//         }

//         switch (event.type) {
//           case "polygon": {
//             const polygon = event.overlay;
//             const path = polygon.getPath().getArray();
//             if (path.length < 3) {
//               alert("Polygon must have at least 3 points.");
//               polygon.setMap(null);
//               return;
//             }
//             let coordinates = path.map((latLng) => [
//               latLng.lng(),
//               latLng.lat(),
//             ]);
//             coordinates.push(coordinates[0]); // close polygon

//             geojson = {
//               type: "Polygon",
//               coordinates: [coordinates],
//             };
//             break;
//           }

//           case "polyline": {
//             const polyline = event.overlay;
//             const path = polyline.getPath().getArray();
//             if (path.length < 2) {
//               alert("Line must have at least 2 points.");
//               polyline.setMap(null);
//               return;
//             }
//             const coordinates = path.map((latLng) => [
//               latLng.lng(),
//               latLng.lat(),
//             ]);

//             geojson = {
//               type: "LineString",
//               coordinates,
//             };
//             break;
//           }

//           case "circle": {
//             const circle = event.overlay;
//             const center = circle.getCenter();
//             const radius = circle.getRadius();

//             // Approximate circle as polygon with 64 points
//             const points = [];
//             const numPoints = 64;
//             for (let i = 0; i < numPoints; i++) {
//               const angle = (i / numPoints) * 2 * Math.PI;
//               const dx = radius * Math.cos(angle);
//               const dy = radius * Math.sin(angle);

//               // Using turf to calculate point at distance and bearing
//               const point = turf.destination(
//                 turf.point([center.lng(), center.lat()]),
//                 radius / 1000, // convert meters to km
//                 (angle * 180) / Math.PI,
//                 { units: "kilometers" }
//               );
//               points.push(point.geometry.coordinates);
//             }
//             points.push(points[0]); // close polygon

//             geojson = {
//               type: "Polygon",
//               coordinates: [points],
//             };
//             break;
//           }

//           case "rectangle": {
//             const rectangle = event.overlay;
//             const bounds = rectangle.getBounds();
//             const ne = bounds.getNorthEast();
//             const sw = bounds.getSouthWest();
//             const nw = new window.google.maps.LatLng(ne.lat(), sw.lng());
//             const se = new window.google.maps.LatLng(sw.lat(), ne.lng());

//             const coordinates = [
//               [sw.lng(), sw.lat()],
//               [nw.lng(), nw.lat()],
//               [ne.lng(), ne.lat()],
//               [se.lng(), se.lat()],
//               [sw.lng(), sw.lat()], // close polygon
//             ];

//             geojson = {
//               type: "Polygon",
//               coordinates: [coordinates],
//             };
//             break;
//           }

//           default:
//             alert("Unsupported shape type");
//             event.overlay.setMap(null);
//             return;
//         }

//         // Validate GeoJSON
//         if (
//           (geojson.type === "Polygon" &&
//             !geojsonValidation.isPolygon(geojson)) ||
//           (geojson.type === "LineString" &&
//             !geojsonValidation.isLineString(geojson))
//         ) {
//           alert("Invalid GeoJSON shape drawn. Please try again.");
//           event.overlay.setMap(null);
//           return;
//         }

//         await saveZone(name.trim(), geojson);
//       }
//     );

//     loadZones(map);
//   };

//   const saveZone = async (name, geojson) => {
//     try {
//       const res = await fetch(apiUrl("/zone"), {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ name, geojson }),
//       });
//       const result = await res.json();
//       alert("Zone saved: " + name);

//       loadZones();

//       // Broadcast WebSocket message after saving
//       if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
//         wsRef.current.send(
//           JSON.stringify({
//             action: "broadcast",
//             type: "zone-update",
//             zoneName: name,
//           })
//         );
//       }
//     } catch (err) {
//       console.error("Failed to save zone:", err);
//       alert("❌ Failed to save zone.");
//     }
//   };

//   const loadZones = async (mapInstance) => {
//     try {
//       const res = await fetch(apiUrl("/zones"));
//       const data = await res.json();
//       setZones(data);

//       const map = mapInstance || mapInstanceRef.current;
//       if (!map) return;

//       data.forEach((zone) => {
//         // Handle different geometry types
//         if (zone.geojson.type === "Polygon") {
//           const polygon = new window.google.maps.Polygon({
//             paths: zone.geojson.coordinates[0].map(([lng, lat]) => ({
//               lat,
//               lng,
//             })),
//             strokeColor: "#FF0000",
//             strokeOpacity: 1,
//             strokeWeight: 2,
//             fillColor: "#FF0000",
//             fillOpacity: 0.2,
//           });
//           polygon.setMap(map);
//         } else if (zone.geojson.type === "LineString") {
//           const polyline = new window.google.maps.Polyline({
//             path: zone.geojson.coordinates.map(([lng, lat]) => ({
//               lat,
//               lng,
//             })),
//             strokeColor: "#FF0000",
//             strokeOpacity: 1,
//             strokeWeight: 2,
//           });
//           polyline.setMap(map);
//         }
//       });
//     } catch (err) {
//       console.error("Failed to load zones:", err);
//     }
//   };

//   const sendEmailAlert = async (eventType, zone, point) => {
//     const body = {
//       type: eventType,
//       zoneId: zone.id,
//       zoneName: zone.name,
//       geojson: zone.geojson,
//       point,
//       timestamp: new Date().toISOString(),
//     };

//     try {
//       await fetch(apiUrl("/alert"), {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(body),
//       });
//       console.log("✅ Email alert sent:", body);
//     } catch (err) {
//       console.error("Failed to send email alert:", err);
//     }
//   };

//   const handleDelete = async (id) => {
//     try {
//       await fetch(apiUrl(`/zone/${id}`), { method: "DELETE" });
//       setZones((prev) => prev.filter((z) => z.id !== id));
//       alert("Zone deleted");
//     } catch (err) {
//       console.error("Failed to delete zone:", err);
//     }
//   };

//   const handleFileUpload = async (event) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;

//     for (let file of files) {
//       try {
//         const text = await file.text();
//         const json = JSON.parse(text);

//         if (
//           !geojsonValidation.isPolygon(json) &&
//           !geojsonValidation.isMultiPolygon(json) &&
//           !geojsonValidation.isLineString(json)
//         ) {
//           setUploadStatus(
//             `❌ Invalid GeoJSON in ${file.name}: Only Polygon, MultiPolygon, or LineString supported.`
//           );
//           continue;
//         }

//         const name =
//           prompt(`Enter a name for zone in ${file.name}`) ||
//           file.name.replace(".geojson", "");
//         if (!name || name.trim() === "") {
//           alert("Zone name is required. Skipping " + file.name);
//           continue;
//         }

//         await saveZone(name.trim(), json);
//         setUploadStatus(`✅ Zone uploaded: ${name.trim()}`);
//       } catch (err) {
//         console.error(err);
//         setUploadStatus(`❌ Error reading or uploading ${file.name}.`);
//       }
//     }

//     if (fileInputRef.current) {
//       fileInputRef.current.value = "";
//     }
//   };

//   // Asset movement and geofencing logic
//   useEffect(() => {
//     if (!mapLoaded || zones.length === 0 || !mapInstanceRef.current) return;

//     const interval = setInterval(() => {
//       const deltaLat = (Math.random() - 0.5) * 0.0005;
//       const deltaLng = (Math.random() - 0.5) * 0.0005;

//       setAssetPosition((prev) => {
//         const newPos = {
//           lat: prev.lat + deltaLat,
//           lng: prev.lng + deltaLng,
//         };

//         try {
//           LatLngSchema.parse(newPos);
//         } catch (err) {
//           console.warn("Invalid coordinates, skipping...");
//           return prev;
//         }

//         const point = turf.point([newPos.lng, newPos.lat]);
//         let inside = false;
//         let matchedZone = null;

//         for (let zone of zones) {
//           if (zone.geojson.type === "Polygon") {
//             const polygon = turf.polygon(zone.geojson.coordinates);
//             if (turf.booleanPointInPolygon(point, polygon)) {
//               inside = true;
//               matchedZone = zone;
//               break;
//             }
//           }
//           // Note: LineString zones don't have "inside" concept for point-in-polygon
//         }

//         const timestamp = new Date().toLocaleString();

//         if (inside && !inZone) {
//           setInZone(true);
//           setEventLog((prev) => [
//             { type: "Entered", zone: matchedZone.name, time: timestamp },
//             ...prev,
//           ]);
//           sendEmailAlert("ENTER", matchedZone, point);
//         } else if (!inside && inZone) {
//           setInZone(false);
//           setEventLog((prev) => [
//             {
//               type: "Exited",
//               zone: matchedZone?.name || "Unknown",
//               time: timestamp,
//             },
//             ...prev,
//           ]);
//           sendEmailAlert("EXIT", matchedZone || {}, point);
//         }

//         const map = mapInstanceRef.current;
//         if (!markerRef.current) {
//           markerRef.current = new window.google.maps.Marker({
//             map,
//             title: "Asset",
//             icon: {
//               path: window.google.maps.SymbolPath.CIRCLE,
//               scale: 6,
//               fillColor: inside ? "#0f0" : "#f00",
//               fillOpacity: 1,
//               strokeWeight: 1,
//             },
//           });
//         }

//         markerRef.current.setIcon({
//           path: window.google.maps.SymbolPath.CIRCLE,
//           scale: 6,
//           fillColor: inside ? "#0f0" : "#f00",
//           fillOpacity: 1,
//           strokeWeight: 1,
//         });
//         markerRef.current.setPosition(
//           new window.google.maps.LatLng(newPos.lat, newPos.lng)
//         );

//         return newPos;
//       });
//     }, 1000);

//     return () => clearInterval(interval);
//   }, [zones, mapLoaded, inZone]);

//   // WebSocket connection
//   useEffect(() => {
//     const socket = new WebSocket(
//       "wss://dlo9rcu5g1.execute-api.us-east-1.amazonaws.com/$default"
//     );
//     wsRef.current = socket;

//     socket.onopen = () => {
//       console.log("✅ WebSocket connected");
//       setWsStatus("Connected");
//     };

//     socket.onclose = () => {
//       console.warn("❌ WebSocket disconnected");
//       setWsStatus("Disconnected");
//     };

//     socket.onerror = (err) => {
//       console.error("🚨 WebSocket error", err);
//       setWsStatus("Error");
//     };

//     socket.onmessage = (event) => {
//       try {
//         const data = JSON.parse(event.data);
//         console.log("📨 WebSocket message received:", data);

//         // Handle incoming WebSocket messages
//         if (data.type === "zone-update") {
//           // Reload zones when another client updates them
//           loadZones();
//         }
//       } catch (err) {
//         console.error("Failed to parse WebSocket message:", err);
//       }
//     };

//     return () => {
//       socket.close();

//     };
//   }, []);

//   return (
//     <Box sx={{ p: 3 }}>
//       <Typography variant="h4" gutterBottom>
//         Zone Manager
//       </Typography>

//       <Box sx={{ mb: 2 }}>
//         <Typography
//           variant="caption"
//           color={wsStatus === "Connected" ? "success.main" : "error.main"}
//         >
//           WebSocket: {wsStatus}
//         </Typography>
//       </Box>

//       <Box
//         ref={mapRef}
//         style={{ width: "100%", height: "500px", marginBottom: "24px" }}
//       />

//       <Box sx={{ mb: 3 }}>
//         <Typography variant="h6">📂 Upload GeoJSON Zone</Typography>
//         <input
//           type="file"
//           ref={fileInputRef}
//           accept=".geojson,application/geo+json"
//           onChange={handleFileUpload}
//           multiple
//           style={{ marginBottom: "8px" }}
//         />
//         {uploadStatus && (
//           <Typography
//             variant="body2"
//             color={
//               uploadStatus.startsWith("✅") ? "success.main" : "error.main"
//             }
//           >
//             {uploadStatus}
//           </Typography>
//         )}
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🗂️ Saved Zones ({zones.length})</Typography>
//         {zones.length === 0 ? (
//           <Typography>
//             No zones available. Draw zones on the map or upload GeoJSON files.
//           </Typography>
//         ) : (
//           zones.map((zone) => (
//             <Box
//               key={zone.id}
//               sx={{
//                 mb: 1,
//                 p: 1,
//                 border: 1,
//                 borderColor: "grey.300",
//                 borderRadius: 1,
//               }}
//             >
//               <Typography variant="body1">{zone.name}</Typography>
//               <Typography variant="caption" color="text.secondary">
//                 Type: {zone.geojson.type}
//               </Typography>
//               <Box sx={{ mt: 1 }}>
//                 <Button
//                   variant="outlined"
//                   color="error"
//                   size="small"
//                   onClick={() => handleDelete(zone.id)}
//                 >
//                   Delete Zone
//                 </Button>
//               </Box>
//             </Box>
//           ))
//         )}
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🕒 Entry/Exit Log</Typography>
//         {eventLog.length === 0 ? (
//           <Typography>
//             No events yet. Asset movement will be logged here.
//           </Typography>
//         ) : (
//           <List>
//             {eventLog.slice(0, 10).map((log, idx) => (
//               <ListItem key={idx} sx={{ py: 0.5 }}>
//                 <ListItemText
//                   primary={`${log.type} - ${log.zone}`}
//                   secondary={log.time}
//                 />
//               </ListItem>
//             ))}
//           </List>
//         )}
//       </Box>
//     </Box>
//   );
// };

// export default ZoneManager;

// import React, { useEffect, useRef, useState } from "react";
// import {
//   Box,
//   Typography,
//   Button,
//   Divider,
//   List,
//   ListItem,
//   ListItemText,
// } from "@mui/material";
// import * as turf from "@turf/turf";
// import * as geojsonValidation from "geojson-validation";
// import { z } from "zod";

// const GOOGLE_MAP_API_KEY = process.env.REACT_APP_GOOGLEAPI;
// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

// function apiUrl(path) {
//   return `${API_BASE_URL}${path}`;
// }

// const ZoneManager = () => {
//   const mapRef = useRef(null);
//   const markerRef = useRef(null);
//   const mapInstanceRef = useRef(null);
//   const fileInputRef = useRef(null);

//   // Fixed WebSocket ref - removed invalid syntax
//   const wsRef = useRef(null);
//   const [wsStatus, setWsStatus] = useState("Disconnected");

//   const [mapLoaded, setMapLoaded] = useState(false);
//   const [zones, setZones] = useState([]);
//   const [uploadStatus, setUploadStatus] = useState("");
//   const [assetPosition, setAssetPosition] = useState({
//     lat: 40.7825,
//     lng: -73.965,
//   });
//   const [inZone, setInZone] = useState(false);
//   const [eventLog, setEventLog] = useState([]);

//   const LatLngSchema = z.object({
//     lat: z.number().min(-90).max(90),
//     lng: z.number().min(-180).max(180),
//   });

//   useEffect(() => {
//     if (!window.google && !document.getElementById("google-maps-script")) {
//       const script = document.createElement("script");
//       script.id = "google-maps-script";
//       script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAP_API_KEY}&libraries=drawing`;
//       script.async = true;
//       script.defer = true;
//       script.onload = () => setMapLoaded(true);
//       document.body.appendChild(script);
//     } else {
//       setMapLoaded(true);
//     }
//   }, []);

//   useEffect(() => {
//     if (mapLoaded) initMap();
//   }, [mapLoaded]);

//   const initMap = () => {
//     const map = new window.google.maps.Map(mapRef.current, {
//       center: { lat: 40.7829, lng: -73.9654 },
//       zoom: 15,
//     });
//     mapInstanceRef.current = map;

//     const drawingManager = new window.google.maps.drawing.DrawingManager({
//       drawingMode: null, // default no drawing mode
//       drawingControl: true,
//       drawingControlOptions: {
//         position: window.google.maps.ControlPosition.TOP_CENTER,
//         drawingModes: [
//           window.google.maps.drawing.OverlayType.POLYGON,
//           window.google.maps.drawing.OverlayType.POLYLINE,
//           window.google.maps.drawing.OverlayType.CIRCLE,
//           window.google.maps.drawing.OverlayType.RECTANGLE,
//         ],
//       },
//       polygonOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       polylineOptions: {
//         strokeColor: "#2196F3",
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       rectangleOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       circleOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//     });

//     drawingManager.setMap(map);

//     window.google.maps.event.addListener(
//       drawingManager,
//       "overlaycomplete",
//       async (event) => {
//         let geojson;
//         let name = prompt("Enter Zone Name");
//         if (!name || name.trim() === "") {
//           alert("Zone name cannot be empty.");
//           event.overlay.setMap(null);
//           return;
//         }

//         switch (event.type) {
//           case "polygon": {
//             const polygon = event.overlay;
//             const path = polygon.getPath().getArray();
//             if (path.length < 3) {
//               alert("Polygon must have at least 3 points.");
//               polygon.setMap(null);
//               return;
//             }
//             let coordinates = path.map((latLng) => [
//               latLng.lng(),
//               latLng.lat(),
//             ]);
//             coordinates.push(coordinates[0]); // close polygon

//             geojson = {
//               type: "Polygon",
//               coordinates: [coordinates],
//             };
//             break;
//           }

//           case "polyline": {
//             const polyline = event.overlay;
//             const path = polyline.getPath().getArray();
//             if (path.length < 2) {
//               alert("Line must have at least 2 points.");
//               polyline.setMap(null);
//               return;
//             }
//             const coordinates = path.map((latLng) => [
//               latLng.lng(),
//               latLng.lat(),
//             ]);

//             geojson = {
//               type: "LineString",
//               coordinates,
//             };
//             break;
//           }

//           case "circle": {
//             const circle = event.overlay;
//             const center = circle.getCenter();
//             const radius = circle.getRadius();

//             // Approximate circle as polygon with 64 points
//             const points = [];
//             const numPoints = 64;
//             for (let i = 0; i < numPoints; i++) {
//               const angle = (i / numPoints) * 2 * Math.PI;
//               const dx = radius * Math.cos(angle);
//               const dy = radius * Math.sin(angle);

//               // Using turf or manual calculation to get latLng offset
//               // Using turf (you already imported):
//               const point = turf.destination(
//                 turf.point([center.lng(), center.lat()]),
//                 radius / 1000, // convert meters to km
//                 (angle * 180) / Math.PI,
//                 { units: "kilometers" }
//               );
//               points.push(point.geometry.coordinates);
//             }
//             points.push(points[0]); // close polygon

//             geojson = {
//               type: "Polygon",
//               coordinates: [points],
//             };
//             break;
//           }

//           case "rectangle": {
//             const rectangle = event.overlay;
//             const bounds = rectangle.getBounds();
//             const ne = bounds.getNorthEast();
//             const sw = bounds.getSouthWest();
//             const nw = new window.google.maps.LatLng(ne.lat(), sw.lng());
//             const se = new window.google.maps.LatLng(sw.lat(), ne.lng());

//             const coordinates = [
//               [sw.lng(), sw.lat()],
//               [nw.lng(), nw.lat()],
//               [ne.lng(), ne.lat()],
//               [se.lng(), se.lat()],
//               [sw.lng(), sw.lat()], // close polygon
//             ];

//             geojson = {
//               type: "Polygon",
//               coordinates: [coordinates],
//             };
//             break;
//           }

//           default:
//             alert("Unsupported shape type");
//             event.overlay.setMap(null);
//             return;
//         }

//         // Validate polygon or linestring as needed here (you already do for polygon)
//         if (
//           (geojson.type === "Polygon" &&
//             !geojsonValidation.isPolygon(geojson)) ||
//           (geojson.type === "LineString" &&
//             !geojsonValidation.isLineString(geojson))
//         ) {
//           alert("Invalid GeoJSON shape drawn. Please try again.");
//           event.overlay.setMap(null);
//           return;
//         }

//         await saveZone(name.trim(), geojson);
//       }
//     );

//     loadZones(map);
//   };

//   const saveZone = async (name, geojson) => {
//     try {
//       const res = await fetch(apiUrl("/zone"), {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ name, geojson }),
//       });
//       const result = await res.json();
//       alert("Zone saved: " + name);

//       loadZones();

//       // ✅ Broadcast WebSocket message after saving
//       if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
//         wsRef.current.send(
//           JSON.stringify({
//             action: "broadcast",
//             type: "zone-update",
//             zoneName: name,
//           })
//         );
//       }
//     } catch (err) {
//       console.error("Failed to save zone:", err);
//       alert("❌ Failed to save zone.");
//     }
//   };

//   const loadZones = async (mapInstance) => {
//     try {
//       const res = await fetch(apiUrl("/zones"));
//       const data = await res.json();
//       setZones(data);

//       const map = mapInstance || mapInstanceRef.current;

//       data.forEach((zone) => {
//         const polygon = new window.google.maps.Polygon({
//           paths: zone.geojson.coordinates[0].map(([lng, lat]) => ({
//             lat,
//             lng,
//           })),
//           strokeColor: "#FF0000",
//           strokeOpacity: 1,
//           strokeWeight: 2,
//           fillColor: "#FF0000",
//           fillOpacity: 0.2,
//         });
//         polygon.setMap(map);
//       });
//     } catch (err) {
//       console.error("Failed to load zones:", err);
//     }
//   };

//   const sendEmailAlert = async (eventType, zone, point) => {
//     const body = {
//       type: eventType,
//       zoneId: zone.id,
//       zoneName: zone.name,
//       geojson: zone.geojson,
//       point,
//       timestamp: new Date().toISOString(),
//     };

//     try {
//       await fetch(apiUrl("/alert"), {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(body),
//       });
//       console.log("✅ Email alert sent:", body);
//     } catch (err) {
//       console.error("Failed to send email alert:", err);
//     }
//   };

//   const handleDelete = async (id) => {
//     try {
//       await fetch(apiUrl(`/zone/${id}`), { method: "DELETE" });
//       setZones((prev) => prev.filter((z) => z.id !== id));
//       alert("Zone deleted");
//     } catch (err) {
//       console.error("Failed to delete zone:", err);
//     }
//   };

//   const handleFileUpload = async (event) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;

//     for (let file of files) {
//       try {
//         const text = await file.text();
//         const json = JSON.parse(text);

//         if (
//           !geojsonValidation.isPolygon(json) &&
//           !geojsonValidation.isMultiPolygon(json)
//         ) {
//           setUploadStatus(
//             `❌ Invalid GeoJSON in ${file.name}: Only Polygon or MultiPolygon.`
//           );
//           continue;
//         }

//         const name =
//           prompt(`Enter a name for zone in ${file.name}`) ||
//           file.name.replace(".geojson", "");
//         if (!name || name.trim() === "") {
//           alert("Zone name is required. Skipping " + file.name);
//           continue;
//         }

//         await saveZone(name.trim(), json);
//         alert(`✅ Zone uploaded: ${name.trim()}`);
//         setUploadStatus(`✅ Zone uploaded: ${name.trim()}`);
//       } catch (err) {
//         console.error(err);
//         setUploadStatus(`❌ Error reading or uploading ${file.name}.`);
//       }
//     }

//     if (fileInputRef.current) {
//       fileInputRef.current.value = "";
//     }
//   };

//   useEffect(() => {
//     if (!mapLoaded || zones.length === 0 || !mapInstanceRef.current) return;

//     const interval = setInterval(() => {
//       const deltaLat = (Math.random() - 0.5) * 0.0005;
//       const deltaLng = (Math.random() - 0.5) * 0.0005;

//       setAssetPosition((prev) => {
//         const newPos = {
//           lat: prev.lat + deltaLat,
//           lng: prev.lng + deltaLng,
//         };

//         try {
//           LatLngSchema.parse(newPos);
//         } catch (err) {
//           console.warn("Invalid coordinates, skipping...");
//           return prev;
//         }

//         const point = turf.point([newPos.lng, newPos.lat]);
//         let inside = false;
//         let matchedZone = null;

//         for (let zone of zones) {
//           const polygon = turf.polygon(zone.geojson.coordinates);
//           if (turf.booleanPointInPolygon(point, polygon)) {
//             inside = true;
//             matchedZone = zone;
//             break;
//           }
//         }

//         const timestamp = new Date().toLocaleString();

//         if (inside && !inZone) {
//           setInZone(true);
//           setEventLog((prev) => [
//             { type: "Entered", zone: matchedZone.name, time: timestamp },
//             ...prev,
//           ]);
//           sendEmailAlert("ENTER", matchedZone, point);
//         } else if (!inside && inZone) {
//           setInZone(false);
//           setEventLog((prev) => [
//             {
//               type: "Exited",
//               zone: matchedZone?.name || "Unknown",
//               time: timestamp,
//             },
//             ...prev,
//           ]);
//           sendEmailAlert("EXIT", matchedZone || {}, point);
//         }

//         const map = mapInstanceRef.current;
//         if (!markerRef.current) {
//           markerRef.current = new window.google.maps.Marker({
//             map,
//             title: "Asset",
//             icon: {
//               path: window.google.maps.SymbolPath.CIRCLE,
//               scale: 6,
//               fillColor: inside ? "#0f0" : "#f00",
//               fillOpacity: 1,
//               strokeWeight: 1,
//             },
//           });
//         }

//         markerRef.current.setIcon({
//           ...markerRef.current.getIcon(),
//           fillColor: inside ? "#0f0" : "#f00",
//         });
//         markerRef.current.setPosition(
//           new window.google.maps.LatLng(newPos.lat, newPos.lng)
//         );

//         return newPos;
//       });
//     }, 1000);

//     return () => clearInterval(interval);
//   }, [zones, mapLoaded, inZone]);

//   useEffect(() => {
//     const socket = new WebSocket(
//       "wss://dlo9rcu5g1.execute-api.us-east-1.amazonaws.com/$default"
//     );
//     wsRef.current = socket;

//     socket.onopen = () => {
//       console.log("✅ WebSocket connected");
//       setWsStatus("Connected");
//     };

//     socket.onclose = () => {
//       console.warn("❌ WebSocket disconnected");
//       setWsStatus("Disconnected");
//     };

//     socket.onerror = (err) => {
//       console.error("🚨 WebSocket error", err);
//       setWsStatus("Disconnected");
//     };

//     return () => {
//       socket.close();
//     };
//   }, []);

//   return (
//     <Box sx={{ p: 3 }}>
//       <Typography variant="h4" gutterBottom>
//         Zone Manager
//       </Typography>

//       <Box
//         ref={mapRef}
//         style={{ width: "100%", height: "500px", marginBottom: "24px" }}
//       />

//       <Box sx={{ mb: 3 }}>
//         <Typography variant="h6">📂 Upload GeoJSON Zone</Typography>
//         <input
//           type="file"
//           ref={fileInputRef}
//           accept=".geojson,application/geo+json"
//           onChange={handleFileUpload}
//           multiple
//         />

//         <Typography variant="h6">
//           📂{" "}
//           {uploadStatus.startsWith("✅")
//             ? "Upload another GeoJSON Zone"
//             : "Upload GeoJSON Zone"}
//         </Typography>
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🗂️ Saved Zones</Typography>
//         {zones.length === 0 ? (
//           <Typography>No zones available.</Typography>
//         ) : (
//           zones.map((zone) => (
//             <Box key={zone.id} sx={{ mb: 1 }}>
//               <Typography>{zone.name}</Typography>
//               <Button
//                 variant="outlined"
//                 color="error"
//                 onClick={() => handleDelete(zone.id)}
//               >
//                 Delete Zone
//               </Button>
//             </Box>
//           ))
//         )}
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🕒 Entry/Exit Log</Typography>
//         {eventLog.length === 0 ? (
//           <Typography>No events yet.</Typography>
//         ) : (
//           <List>
//             {eventLog.map((log, idx) => (
//               <ListItem key={idx}>
//                 <ListItemText
//                   primary={`${log.time} - ${log.type} - ${log.zone}`}
//                 />
//               </ListItem>
//             ))}
//           </List>
//         )}
//       </Box>
//       {/* <Typography variant="caption">WebSocket: {wsStatus}</Typography> */}
//     </Box>
//   );
// };

// export default ZoneManager;

// import React, { useEffect, useRef, useState } from "react";
// import {
//   Box,
//   Typography,
//   Button,
//   Divider,
//   List,
//   ListItem,
//   ListItemText,
// } from "@mui/material";
// import * as turf from "@turf/turf";
// import * as geojsonValidation from "geojson-validation";
// import { z } from "zod";

// const GOOGLE_MAP_API_KEY = process.env.REACT_APP_GOOGLEAPI;
// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

// function apiUrl(path) {
//   return `${API_BASE_URL}${path}`;
// }

// const ZoneManager = () => {
//   const mapRef = useRef(null);
//   const markerRef = useRef(null);
//   const mapInstanceRef = useRef(null);
//   const fileInputRef = useRef(null);

//   const [mapLoaded, setMapLoaded] = useState(false);
//   const [zones, setZones] = useState([]);
//   const [uploadStatus, setUploadStatus] = useState("");
//   const [assetPosition, setAssetPosition] = useState({
//     lat: 40.7825,
//     lng: -73.965,
//   });
//   const [inZone, setInZone] = useState(false);
//   const [eventLog, setEventLog] = useState([]);

//   const LatLngSchema = z.object({
//     lat: z.number().min(-90).max(90),
//     lng: z.number().min(-180).max(180),
//   });

//   useEffect(() => {
//     if (!window.google && !document.getElementById("google-maps-script")) {
//       const script = document.createElement("script");
//       script.id = "google-maps-script";
//       script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAP_API_KEY}&libraries=drawing`;
//       script.async = true;
//       script.defer = true;
//       script.onload = () => setMapLoaded(true);
//       document.body.appendChild(script);
//     } else {
//       setMapLoaded(true);
//     }
//   }, []);

//   useEffect(() => {
//     if (mapLoaded) initMap();
//   }, [mapLoaded]);

//   const initMap = () => {
//     const map = new window.google.maps.Map(mapRef.current, {
//       center: { lat: 40.7829, lng: -73.9654 },
//       zoom: 15,
//     });
//     mapInstanceRef.current = map;

//     const drawingManager = new window.google.maps.drawing.DrawingManager({
//       drawingMode: null, // default no drawing mode
//       drawingControl: true,
//       drawingControlOptions: {
//         position: window.google.maps.ControlPosition.TOP_CENTER,
//         drawingModes: [
//           window.google.maps.drawing.OverlayType.POLYGON,
//           window.google.maps.drawing.OverlayType.POLYLINE,
//           window.google.maps.drawing.OverlayType.CIRCLE,
//           window.google.maps.drawing.OverlayType.RECTANGLE,
//         ],
//       },
//       polygonOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       polylineOptions: {
//         strokeColor: "#2196F3",
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       rectangleOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//       circleOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//     });

//     drawingManager.setMap(map);

//     window.google.maps.event.addListener(
//       drawingManager,
//       "overlaycomplete",
//       async (event) => {
//         let geojson;
//         let name = prompt("Enter Zone Name");
//         if (!name || name.trim() === "") {
//           alert("Zone name cannot be empty.");
//           event.overlay.setMap(null);
//           return;
//         }

//         switch (event.type) {
//           case "polygon": {
//             const polygon = event.overlay;
//             const path = polygon.getPath().getArray();
//             if (path.length < 3) {
//               alert("Polygon must have at least 3 points.");
//               polygon.setMap(null);
//               return;
//             }
//             let coordinates = path.map((latLng) => [
//               latLng.lng(),
//               latLng.lat(),
//             ]);
//             coordinates.push(coordinates[0]); // close polygon

//             geojson = {
//               type: "Polygon",
//               coordinates: [coordinates],
//             };
//             break;
//           }

//           case "polyline": {
//             const polyline = event.overlay;
//             const path = polyline.getPath().getArray();
//             if (path.length < 2) {
//               alert("Line must have at least 2 points.");
//               polyline.setMap(null);
//               return;
//             }
//             const coordinates = path.map((latLng) => [
//               latLng.lng(),
//               latLng.lat(),
//             ]);

//             geojson = {
//               type: "LineString",
//               coordinates,
//             };
//             break;
//           }

//           case "circle": {
//             const circle = event.overlay;
//             const center = circle.getCenter();
//             const radius = circle.getRadius();

//             // Approximate circle as polygon with 64 points
//             const points = [];
//             const numPoints = 64;
//             for (let i = 0; i < numPoints; i++) {
//               const angle = (i / numPoints) * 2 * Math.PI;
//               const dx = radius * Math.cos(angle);
//               const dy = radius * Math.sin(angle);

//               // Using turf or manual calculation to get latLng offset
//               // Using turf (you already imported):
//               const point = turf.destination(
//                 turf.point([center.lng(), center.lat()]),
//                 radius / 1000, // convert meters to km
//                 (angle * 180) / Math.PI,
//                 { units: "kilometers" }
//               );
//               points.push(point.geometry.coordinates);
//             }
//             points.push(points[0]); // close polygon

//             geojson = {
//               type: "Polygon",
//               coordinates: [points],
//             };
//             break;
//           }

//           case "rectangle": {
//             const rectangle = event.overlay;
//             const bounds = rectangle.getBounds();
//             const ne = bounds.getNorthEast();
//             const sw = bounds.getSouthWest();
//             const nw = new window.google.maps.LatLng(ne.lat(), sw.lng());
//             const se = new window.google.maps.LatLng(sw.lat(), ne.lng());

//             const coordinates = [
//               [sw.lng(), sw.lat()],
//               [nw.lng(), nw.lat()],
//               [ne.lng(), ne.lat()],
//               [se.lng(), se.lat()],
//               [sw.lng(), sw.lat()], // close polygon
//             ];

//             geojson = {
//               type: "Polygon",
//               coordinates: [coordinates],
//             };
//             break;
//           }

//           default:
//             alert("Unsupported shape type");
//             event.overlay.setMap(null);
//             return;
//         }

//         // Validate polygon or linestring as needed here (you already do for polygon)
//         if (
//           (geojson.type === "Polygon" &&
//             !geojsonValidation.isPolygon(geojson)) ||
//           (geojson.type === "LineString" &&
//             !geojsonValidation.isLineString(geojson))
//         ) {
//           alert("Invalid GeoJSON shape drawn. Please try again.");
//           event.overlay.setMap(null);
//           return;
//         }

//         await saveZone(name.trim(), geojson);
//       }
//     );

//     loadZones(map);
//   };

//   const saveZone = async (name, geojson) => {
//     try {
//       const res = await fetch(apiUrl("/zone"), {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ name, geojson }),
//       });
//       const result = await res.json();
//       alert("Zone saved: " + name);
//       loadZones();
//     } catch (err) {
//       console.error("Failed to save zone:", err);
//       alert("❌ Failed to save zone.");
//     }
//   };

//   const loadZones = async (mapInstance) => {
//     try {
//       const res = await fetch(apiUrl("/zones"));
//       const data = await res.json();
//       setZones(data);

//       const map = mapInstance || mapInstanceRef.current;

//       data.forEach((zone) => {
//         const polygon = new window.google.maps.Polygon({
//           paths: zone.geojson.coordinates[0].map(([lng, lat]) => ({
//             lat,
//             lng,
//           })),
//           strokeColor: "#FF0000",
//           strokeOpacity: 1,
//           strokeWeight: 2,
//           fillColor: "#FF0000",
//           fillOpacity: 0.2,
//         });
//         polygon.setMap(map);
//       });
//     } catch (err) {
//       console.error("Failed to load zones:", err);
//     }
//   };

//   const sendEmailAlert = async (eventType, zone, point) => {
//     const body = {
//       type: eventType,
//       zoneId: zone.id,
//       zoneName: zone.name,
//       geojson: zone.geojson,
//       point,
//       timestamp: new Date().toISOString(),
//     };

//     try {
//       await fetch(apiUrl("/alert"), {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(body),
//       });
//       console.log("✅ Email alert sent:", body);
//     } catch (err) {
//       console.error("Failed to send email alert:", err);
//     }
//   };

//   const handleDelete = async (id) => {
//     try {
//       await fetch(apiUrl(`/zone/${id}`), { method: "DELETE" });
//       setZones((prev) => prev.filter((z) => z.id !== id));
//       alert("Zone deleted");
//     } catch (err) {
//       console.error("Failed to delete zone:", err);
//     }
//   };

//   const handleFileUpload = async (event) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;

//     for (let file of files) {
//       try {
//         const text = await file.text();
//         const json = JSON.parse(text);

//         if (
//           !geojsonValidation.isPolygon(json) &&
//           !geojsonValidation.isMultiPolygon(json)
//         ) {
//           setUploadStatus(
//             `❌ Invalid GeoJSON in ${file.name}: Only Polygon or MultiPolygon.`
//           );
//           continue;
//         }

//         const name =
//           prompt(`Enter a name for zone in ${file.name}`) ||
//           file.name.replace(".geojson", "");
//         if (!name || name.trim() === "") {
//           alert("Zone name is required. Skipping " + file.name);
//           continue;
//         }

//         await saveZone(name.trim(), json);
//         alert(`✅ Zone uploaded: ${name.trim()}`);
//         setUploadStatus(`✅ Zone uploaded: ${name.trim()}`);
//       } catch (err) {
//         console.error(err);
//         setUploadStatus(`❌ Error reading or uploading ${file.name}.`);
//       }
//     }

//     if (fileInputRef.current) {
//       fileInputRef.current.value = "";
//     }
//   };

//   useEffect(() => {
//     if (!mapLoaded || zones.length === 0 || !mapInstanceRef.current) return;

//     const interval = setInterval(() => {
//       const deltaLat = (Math.random() - 0.5) * 0.0005;
//       const deltaLng = (Math.random() - 0.5) * 0.0005;

//       setAssetPosition((prev) => {
//         const newPos = {
//           lat: prev.lat + deltaLat,
//           lng: prev.lng + deltaLng,
//         };

//         try {
//           LatLngSchema.parse(newPos);
//         } catch (err) {
//           console.warn("Invalid coordinates, skipping...");
//           return prev;
//         }

//         const point = turf.point([newPos.lng, newPos.lat]);
//         let inside = false;
//         let matchedZone = null;

//         for (let zone of zones) {
//           const polygon = turf.polygon(zone.geojson.coordinates);
//           if (turf.booleanPointInPolygon(point, polygon)) {
//             inside = true;
//             matchedZone = zone;
//             break;
//           }
//         }

//         const timestamp = new Date().toLocaleString();

//         if (inside && !inZone) {
//           setInZone(true);
//           setEventLog((prev) => [
//             { type: "Entered", zone: matchedZone.name, time: timestamp },
//             ...prev,
//           ]);
//           sendEmailAlert("ENTER", matchedZone, point);
//         } else if (!inside && inZone) {
//           setInZone(false);
//           setEventLog((prev) => [
//             {
//               type: "Exited",
//               zone: matchedZone?.name || "Unknown",
//               time: timestamp,
//             },
//             ...prev,
//           ]);
//           sendEmailAlert("EXIT", matchedZone || {}, point);
//         }

//         const map = mapInstanceRef.current;
//         if (!markerRef.current) {
//           markerRef.current = new window.google.maps.Marker({
//             map,
//             title: "Asset",
//             icon: {
//               path: window.google.maps.SymbolPath.CIRCLE,
//               scale: 6,
//               fillColor: inside ? "#0f0" : "#f00",
//               fillOpacity: 1,
//               strokeWeight: 1,
//             },
//           });
//         }

//         markerRef.current.setIcon({
//           ...markerRef.current.getIcon(),
//           fillColor: inside ? "#0f0" : "#f00",
//         });
//         markerRef.current.setPosition(
//           new window.google.maps.LatLng(newPos.lat, newPos.lng)
//         );

//         return newPos;
//       });
//     }, 1000);

//     return () => clearInterval(interval);
//   }, [zones, mapLoaded, inZone]);

//   return (
//     <Box sx={{ p: 3 }}>
//       <Typography variant="h4" gutterBottom>
//         Zone Manager
//       </Typography>

//       <Box
//         ref={mapRef}
//         style={{ width: "100%", height: "500px", marginBottom: "24px" }}
//       />

//       <Box sx={{ mb: 3 }}>
//         <Typography variant="h6">📂 Upload GeoJSON Zone</Typography>
//         <input
//           type="file"
//           ref={fileInputRef}
//           accept=".geojson,application/geo+json"
//           onChange={handleFileUpload}
//           multiple
//         />

//         <Typography variant="h6">
//           📂{" "}
//           {uploadStatus.startsWith("✅")
//             ? "Upload another GeoJSON Zone"
//             : "Upload GeoJSON Zone"}
//         </Typography>
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🗂️ Saved Zones</Typography>
//         {zones.length === 0 ? (
//           <Typography>No zones available.</Typography>
//         ) : (
//           zones.map((zone) => (
//             <Box key={zone.id} sx={{ mb: 1 }}>
//               <Typography>{zone.name}</Typography>
//               <Button
//                 variant="outlined"
//                 color="error"
//                 onClick={() => handleDelete(zone.id)}
//               >
//                 Delete Zone
//               </Button>
//             </Box>
//           ))
//         )}
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🕒 Entry/Exit Log</Typography>
//         {eventLog.length === 0 ? (
//           <Typography>No events yet.</Typography>
//         ) : (
//           <List>
//             {eventLog.map((log, idx) => (
//               <ListItem key={idx}>
//                 <ListItemText
//                   primary={`${log.time} - ${log.type} - ${log.zone}`}
//                 />
//               </ListItem>
//             ))}
//           </List>
//         )}
//       </Box>
//     </Box>
//   );
// };

// export default ZoneManager;

// import React, { useEffect, useRef, useState } from "react";
// import {
//   Box,
//   Typography,
//   Button,
//   Divider,
//   List,
//   ListItem,
//   ListItemText,
// } from "@mui/material";
// import * as turf from "@turf/turf";
// import * as geojsonValidation from "geojson-validation";
// import { z } from "zod";

// const GOOGLE_MAP_API_KEY = process.env.REACT_APP_GOOGLEAPI;
// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

// function apiUrl(path) {
//   return `${API_BASE_URL}${path}`;
// }

// const ZoneManager = () => {
//   const mapRef = useRef(null);
//   const markerRef = useRef(null);
//   const mapInstanceRef = useRef(null);
//   const fileInputRef = useRef(null);

//   const [mapLoaded, setMapLoaded] = useState(false);
//   const [zones, setZones] = useState([]);
//   const [uploadStatus, setUploadStatus] = useState("");
//   const [assetPosition, setAssetPosition] = useState({
//     lat: 40.7825,
//     lng: -73.965,
//   });
//   const [inZone, setInZone] = useState(false);
//   const [eventLog, setEventLog] = useState([]);

//   const LatLngSchema = z.object({
//     lat: z.number().min(-90).max(90),
//     lng: z.number().min(-180).max(180),
//   });

//   useEffect(() => {
//     if (!window.google && !document.getElementById("google-maps-script")) {
//       const script = document.createElement("script");
//       script.id = "google-maps-script";
//       script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAP_API_KEY}&libraries=drawing`;
//       script.async = true;
//       script.defer = true;
//       script.onload = () => setMapLoaded(true);
//       document.body.appendChild(script);
//     } else {
//       setMapLoaded(true);
//     }
//   }, []);

//   useEffect(() => {
//     if (mapLoaded) initMap();
//   }, [mapLoaded]);

//   const initMap = () => {
//     const map = new window.google.maps.Map(mapRef.current, {
//       center: { lat: 40.7829, lng: -73.9654 },
//       zoom: 15,
//     });
//     mapInstanceRef.current = map;

//     const drawingManager = new window.google.maps.drawing.DrawingManager({
//       drawingMode: window.google.maps.drawing.OverlayType.POLYGON,
//       drawingControl: true,
//       drawingControlOptions: {
//         position: window.google.maps.ControlPosition.TOP_CENTER,
//         drawingModes: [window.google.maps.drawing.OverlayType.POLYGON],
//       },
//       polygonOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//     });

//     drawingManager.setMap(map);

//     window.google.maps.event.addListener(
//       drawingManager,
//       "overlaycomplete",
//       async (event) => {
//         if (event.type === "polygon") {
//           const polygon = event.overlay;
//           const path = polygon.getPath().getArray();
//           const coordinates = path.map((latLng) => [
//             latLng.lng(),
//             latLng.lat(),
//           ]);

//           if (coordinates.length < 3) {
//             alert("Polygon must have at least 3 points.");
//             polygon.setMap(null);
//             return;
//           }

//           const name = prompt("Enter Zone Name");
//           if (!name || name.trim() === "") {
//             alert("Zone name cannot be empty.");
//             polygon.setMap(null);
//             return;
//           }

//           coordinates.push(coordinates[0]); // close polygon

//           const geojson = {
//             type: "Polygon",
//             coordinates: [coordinates],
//           };

//           if (!geojsonValidation.isPolygon(geojson)) {
//             alert("Invalid Polygon drawn. Please try again.");
//             polygon.setMap(null);
//             return;
//           }

//           await saveZone(name.trim(), geojson);
//         }
//       }
//     );

//     loadZones(map);
//   };

//   const saveZone = async (name, geojson) => {
//     try {
//       const res = await fetch(apiUrl("/zone"), {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ name, geojson }),
//       });
//       const result = await res.json();
//       alert("Zone saved: " + name);
//       loadZones();
//     } catch (err) {
//       console.error("Failed to save zone:", err);
//       alert("❌ Failed to save zone.");
//     }
//   };

//   const loadZones = async (mapInstance) => {
//     try {
//       const res = await fetch(apiUrl("/zones"));
//       const data = await res.json();
//       setZones(data);

//       const map = mapInstance || mapInstanceRef.current;

//       data.forEach((zone) => {
//         const polygon = new window.google.maps.Polygon({
//           paths: zone.geojson.coordinates[0].map(([lng, lat]) => ({
//             lat,
//             lng,
//           })),
//           strokeColor: "#FF0000",
//           strokeOpacity: 1,
//           strokeWeight: 2,
//           fillColor: "#FF0000",
//           fillOpacity: 0.2,
//         });
//         polygon.setMap(map);
//       });
//     } catch (err) {
//       console.error("Failed to load zones:", err);
//     }
//   };

//   const sendEmailAlert = async (eventType, zone, point) => {
//     const body = {
//       type: eventType,
//       zoneId: zone.id,
//       zoneName: zone.name,
//       geojson: zone.geojson,
//       point,
//       timestamp: new Date().toISOString(),
//     };

//     try {
//       await fetch(apiUrl("/alert"), {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(body),
//       });
//       console.log("✅ Email alert sent:", body);
//     } catch (err) {
//       console.error("Failed to send email alert:", err);
//     }
//   };

//   const handleDelete = async (id) => {
//     try {
//       await fetch(apiUrl(`/zone/${id}`), { method: "DELETE" });
//       setZones((prev) => prev.filter((z) => z.id !== id));
//       alert("Zone deleted");
//     } catch (err) {
//       console.error("Failed to delete zone:", err);
//     }
//   };

//   const handleFileUpload = async (event) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;

//     for (let file of files) {
//       try {
//         const text = await file.text();
//         const json = JSON.parse(text);

//         if (
//           !geojsonValidation.isPolygon(json) &&
//           !geojsonValidation.isMultiPolygon(json)
//         ) {
//           setUploadStatus(
//             `❌ Invalid GeoJSON in ${file.name}: Only Polygon or MultiPolygon.`
//           );
//           continue;
//         }

//         const name =
//           prompt(`Enter a name for zone in ${file.name}`) ||
//           file.name.replace(".geojson", "");
//         if (!name || name.trim() === "") {
//           alert("Zone name is required. Skipping " + file.name);
//           continue;
//         }

//         await saveZone(name.trim(), json);
//         alert(`✅ Zone uploaded: ${name.trim()}`);
//         setUploadStatus(`✅ Zone uploaded: ${name.trim()}`);
//       } catch (err) {
//         console.error(err);
//         setUploadStatus(`❌ Error reading or uploading ${file.name}.`);
//       }
//     }

//     if (fileInputRef.current) {
//       fileInputRef.current.value = "";
//     }
//   };

//   useEffect(() => {
//     if (!mapLoaded || zones.length === 0 || !mapInstanceRef.current) return;

//     const interval = setInterval(() => {
//       const deltaLat = (Math.random() - 0.5) * 0.0005;
//       const deltaLng = (Math.random() - 0.5) * 0.0005;

//       setAssetPosition((prev) => {
//         const newPos = {
//           lat: prev.lat + deltaLat,
//           lng: prev.lng + deltaLng,
//         };

//         try {
//           LatLngSchema.parse(newPos);
//         } catch (err) {
//           console.warn("Invalid coordinates, skipping...");
//           return prev;
//         }

//         const point = turf.point([newPos.lng, newPos.lat]);
//         let inside = false;
//         let matchedZone = null;

//         for (let zone of zones) {
//           const polygon = turf.polygon(zone.geojson.coordinates);
//           if (turf.booleanPointInPolygon(point, polygon)) {
//             inside = true;
//             matchedZone = zone;
//             break;
//           }
//         }

//         const timestamp = new Date().toLocaleString();

//         if (inside && !inZone) {
//           setInZone(true);
//           setEventLog((prev) => [
//             { type: "Entered", zone: matchedZone.name, time: timestamp },
//             ...prev,
//           ]);
//           sendEmailAlert("ENTER", matchedZone, point);
//         } else if (!inside && inZone) {
//           setInZone(false);
//           setEventLog((prev) => [
//             {
//               type: "Exited",
//               zone: matchedZone?.name || "Unknown",
//               time: timestamp,
//             },
//             ...prev,
//           ]);
//           sendEmailAlert("EXIT", matchedZone || {}, point);
//         }

//         const map = mapInstanceRef.current;
//         if (!markerRef.current) {
//           markerRef.current = new window.google.maps.Marker({
//             map,
//             title: "Asset",
//             icon: {
//               path: window.google.maps.SymbolPath.CIRCLE,
//               scale: 6,
//               fillColor: inside ? "#0f0" : "#f00",
//               fillOpacity: 1,
//               strokeWeight: 1,
//             },
//           });
//         }

//         markerRef.current.setIcon({
//           ...markerRef.current.getIcon(),
//           fillColor: inside ? "#0f0" : "#f00",
//         });
//         markerRef.current.setPosition(
//           new window.google.maps.LatLng(newPos.lat, newPos.lng)
//         );

//         return newPos;
//       });
//     }, 5000);

//     return () => clearInterval(interval);
//   }, [zones, mapLoaded, inZone]);

//   return (
//     <Box sx={{ p: 3 }}>
//       <Typography variant="h4" gutterBottom>
//         Zone Manager
//       </Typography>

//       <Box
//         ref={mapRef}
//         style={{ width: "100%", height: "500px", marginBottom: "24px" }}
//       />

//       <Box sx={{ mb: 3 }}>
//         <Typography variant="h6">📂 Upload GeoJSON Zone</Typography>
//         <input
//           type="file"
//           ref={fileInputRef}
//           accept=".geojson,application/geo+json"
//           onChange={handleFileUpload}
//           multiple
//         />

//         <Typography variant="h6">
//           📂{" "}
//           {uploadStatus.startsWith("✅")
//             ? "Upload another GeoJSON Zone"
//             : "Upload GeoJSON Zone"}
//         </Typography>
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🗂️ Saved Zones</Typography>
//         {zones.length === 0 ? (
//           <Typography>No zones available.</Typography>
//         ) : (
//           zones.map((zone) => (
//             <Box key={zone.id} sx={{ mb: 1 }}>
//               <Typography>{zone.name}</Typography>
//               <Button
//                 variant="outlined"
//                 color="error"
//                 onClick={() => handleDelete(zone.id)}
//               >
//                 Delete Zone
//               </Button>
//             </Box>
//           ))
//         )}
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🕒 Entry/Exit Log</Typography>
//         {eventLog.length === 0 ? (
//           <Typography>No events yet.</Typography>
//         ) : (
//           <List>
//             {eventLog.map((log, idx) => (
//               <ListItem key={idx}>
//                 <ListItemText
//                   primary={`${log.time} - ${log.type} - ${log.zone}`}
//                 />
//               </ListItem>
//             ))}
//           </List>
//         )}
//       </Box>
//     </Box>
//   );
// };

// export default ZoneManager;

// import React, { useEffect, useRef, useState } from "react";
// import {
//   Box,
//   Typography,
//   Input,
//   Button,
//   Divider,
//   List,
//   ListItem,
//   ListItemText,
// } from "@mui/material";
// import * as turf from "@turf/turf";
// import * as geojsonValidation from "geojson-validation";
// import { z } from "zod";

// const GOOGLE_MAP_API_KEY = process.env.REACT_APP_GOOGLEAPI;
// const ZONE_API = "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zone";
// const ZONES_API =
//   "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zones";
// const DELETE_ZONE_API = (id) =>
//   `https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zone/${id}`;
// const EMAIL_ALERT_API =
//   "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/alert";

// const ZoneManager = () => {
//   const mapRef = useRef(null);
//   const markerRef = useRef(null);
//   const mapInstanceRef = useRef(null);

//   //    file uplod
//   const fileInputRef = useRef(null);

//   const [mapLoaded, setMapLoaded] = useState(false);
//   const [zones, setZones] = useState([]);
//   const [uploadStatus, setUploadStatus] = useState("");
//   const [assetPosition, setAssetPosition] = useState({
//     lat: 40.7825,
//     lng: -73.965,
//   });
//   const [inZone, setInZone] = useState(false);
//   const [eventLog, setEventLog] = useState([]);

//   // Schema
//   const LatLngSchema = z.object({
//     lat: z.number().min(-90).max(90),
//     lng: z.number().min(-180).max(180),
//   });

//   // Load Google Maps JS API
//   useEffect(() => {
//     if (!window.google && !document.getElementById("google-maps-script")) {
//       const script = document.createElement("script");
//       script.id = "google-maps-script";
//       script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAP_API_KEY}&libraries=drawing`;
//       script.async = true;
//       script.defer = true;
//       script.onload = () => setMapLoaded(true);
//       document.body.appendChild(script);
//     } else {
//       setMapLoaded(true);
//     }
//   }, []);

//   useEffect(() => {
//     if (mapLoaded) initMap();
//   }, [mapLoaded]);

//   const initMap = () => {
//     const map = new window.google.maps.Map(mapRef.current, {
//       center: { lat: 40.7829, lng: -73.9654 },
//       zoom: 15,
//     });
//     mapInstanceRef.current = map;

//     const drawingManager = new window.google.maps.drawing.DrawingManager({
//       drawingMode: window.google.maps.drawing.OverlayType.POLYGON,
//       drawingControl: true,
//       drawingControlOptions: {
//         position: window.google.maps.ControlPosition.TOP_CENTER,
//         drawingModes: [window.google.maps.drawing.OverlayType.POLYGON],
//       },
//       polygonOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//     });

//     drawingManager.setMap(map);

//     window.google.maps.event.addListener(
//       drawingManager,
//       "overlaycomplete",
//       async (event) => {
//         if (event.type === "polygon") {
//           const polygon = event.overlay;
//           const path = polygon.getPath().getArray();
//           const coordinates = path.map((latLng) => [
//             latLng.lng(),
//             latLng.lat(),
//           ]);

//           if (coordinates.length < 3) {
//             alert("Polygon must have at least 3 points.");
//             polygon.setMap(null); // ❌ Remove invalid polygon
//             return;
//           }

//           const name = prompt("Enter Zone Name");
//           if (!name || name.trim() === "") {
//             alert("Zone name cannot be empty.");
//             polygon.setMap(null); // ❌ Remove polygon if name is invalid
//             return;
//           }

//           coordinates.push(coordinates[0]); // Close the polygon loop

//           const geojson = {
//             type: "Polygon",
//             coordinates: [coordinates],
//           };

//           if (!geojsonValidation.isPolygon(geojson)) {
//             alert("Invalid Polygon drawn. Please try again.");
//             polygon.setMap(null); // ❌ Remove invalid geometry
//             return;
//           }

//           await saveZone(name.trim(), geojson);
//         }
//       }
//     );

//     loadZones(map);
//   };

//   const saveZone = async (name, geojson) => {
//     try {
//       const res = await fetch(ZONE_API, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ name, geojson }),
//       });
//       const result = await res.json();
//       alert("Zone saved: " + name);
//       loadZones();
//     } catch (err) {
//       console.error("Failed to save zone:", err);
//       alert("❌ Failed to save zone.");
//     }
//   };

//   const loadZones = async (mapInstance) => {
//     try {
//       const res = await fetch(ZONES_API);
//       const data = await res.json();
//       setZones(data);

//       const map = mapInstance || mapInstanceRef.current;

//       data.forEach((zone) => {
//         const polygon = new window.google.maps.Polygon({
//           paths: zone.geojson.coordinates[0].map(([lng, lat]) => ({
//             lat,
//             lng,
//           })),
//           strokeColor: "#FF0000",
//           strokeOpacity: 1,
//           strokeWeight: 2,
//           fillColor: "#FF0000",
//           fillOpacity: 0.2,
//         });
//         polygon.setMap(map);
//       });
//     } catch (err) {
//       console.error("Failed to load zones:", err);
//     }
//   };

//   const sendEmailAlert = async (eventType, zone, point) => {
//     const body = {
//       type: eventType,
//       zoneId: zone.id,
//       zoneName: zone.name,
//       geojson: zone.geojson,
//       point,
//       timestamp: new Date().toISOString(),
//     };

//     try {
//       await fetch(EMAIL_ALERT_API, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(body),
//       });
//       console.log("✅ Email alert sent:", body);
//     } catch (err) {
//       console.error("Failed to send email alert:", err);
//     }
//   };

//   const handleDelete = async (id) => {
//     try {
//       await fetch(DELETE_ZONE_API(id), { method: "DELETE" });
//       setZones((prev) => prev.filter((z) => z.id !== id));
//       alert("Zone deleted");
//     } catch (err) {
//       console.error("Failed to delete zone:", err);
//     }
//   };

//   const handleFileUpload = async (event) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;

//     for (let file of files) {
//       try {
//         const text = await file.text();
//         const json = JSON.parse(text);

//         if (
//           !geojsonValidation.isPolygon(json) &&
//           !geojsonValidation.isMultiPolygon(json)
//         ) {
//           setUploadStatus(
//             `❌ Invalid GeoJSON in ${file.name}: Only Polygon or MultiPolygon.`
//           );
//           continue; // skip invalid file
//         }

//         const name =
//           prompt(`Enter a name for zone in ${file.name}`) ||
//           file.name.replace(".geojson", "");
//         if (!name || name.trim() === "") {
//           alert("Zone name is required. Skipping " + file.name);
//           continue; // skip files without a name
//         }

//         await saveZone(name.trim(), json);
//         alert(`✅ Zone uploaded: ${name.trim()}`);
//         setUploadStatus(`✅ Zone uploaded: ${name.trim()}`);
//       } catch (err) {
//         console.error(err);
//         setUploadStatus(`❌ Error reading or uploading ${file.name}.`);
//       }
//     }

//     // Clear input after all files processed
//     if (fileInputRef.current) {
//       fileInputRef.current.value = "";
//     }
//   };

//   useEffect(() => {
//     if (!mapLoaded || zones.length === 0 || !mapInstanceRef.current) return;

//     const interval = setInterval(() => {
//       const deltaLat = (Math.random() - 0.5) * 0.0005;
//       const deltaLng = (Math.random() - 0.5) * 0.0005;

//       setAssetPosition((prev) => {
//         const newPos = {
//           lat: prev.lat + deltaLat,
//           lng: prev.lng + deltaLng,
//         };

//         try {
//           LatLngSchema.parse(newPos);
//         } catch (err) {
//           console.warn("Invalid coordinates, skipping...");
//           return prev;
//         }

//         const point = turf.point([newPos.lng, newPos.lat]);
//         let inside = false;
//         let matchedZone = null;

//         for (let zone of zones) {
//           const polygon = turf.polygon(zone.geojson.coordinates);
//           if (turf.booleanPointInPolygon(point, polygon)) {
//             inside = true;
//             matchedZone = zone;
//             break;
//           }
//         }

//         const timestamp = new Date().toLocaleString();

//         if (inside && !inZone) {
//           setInZone(true);
//           setEventLog((prev) => [
//             { type: "Entered", zone: matchedZone.name, time: timestamp },
//             ...prev,
//           ]);
//           sendEmailAlert("ENTER", matchedZone, point);
//         } else if (!inside && inZone) {
//           setInZone(false);
//           setEventLog((prev) => [
//             {
//               type: "Exited",
//               zone: matchedZone?.name || "Unknown",
//               time: timestamp,
//             },
//             ...prev,
//           ]);
//           sendEmailAlert("EXIT", matchedZone || {}, point);
//         }

//         const map = mapInstanceRef.current;
//         if (!markerRef.current) {
//           markerRef.current = new window.google.maps.Marker({
//             map,
//             title: "Asset",
//             icon: {
//               path: window.google.maps.SymbolPath.CIRCLE,
//               scale: 6,
//               fillColor: inZone ? "#0f0" : "#f00",
//               fillOpacity: 1,
//               strokeWeight: 1,
//             },
//           });
//         }

//         markerRef.current.setIcon({
//           ...markerRef.current.getIcon(),
//           fillColor: inside ? "#0f0" : "#f00",
//         });
//         markerRef.current.setPosition(
//           new window.google.maps.LatLng(newPos.lat, newPos.lng)
//         );

//         return newPos;
//       });
//     }, 5000);

//     return () => clearInterval(interval);
//   }, [zones, mapLoaded, inZone]);

//   return (
//     <Box sx={{ p: 3 }}>
//       <Typography variant="h4" gutterBottom>
//         Zone Manager
//       </Typography>

//       <Box
//         ref={mapRef}
//         style={{ width: "100%", height: "500px", marginBottom: "24px" }}
//       />

//       <Box sx={{ mb: 3 }}>
//         <Typography variant="h6">📂 Upload GeoJSON Zone</Typography>
//         <input
//   type="file"
//   ref={fileInputRef}
//   accept=".geojson,application/geo+json"
//   onChange={handleFileUpload}
//   multiple
// />

//         <Typography variant="h6">
//           📂{" "}
//           {uploadStatus.startsWith("✅")
//             ? "Upload another GeoJSON Zone"
//             : "Upload GeoJSON Zone"}
//         </Typography>
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🗂️ Saved Zones</Typography>
//         {zones.length === 0 ? (
//           <Typography>No zones available.</Typography>
//         ) : (
//           zones.map((zone) => (
//             <Box key={zone.id} sx={{ mb: 1 }}>
//               <Typography>{zone.name}</Typography>
//               <Button
//                 variant="outlined"
//                 color="error"
//                 onClick={() => handleDelete(zone.id)}
//               >
//                 Delete Zone
//               </Button>
//             </Box>
//           ))
//         )}
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6">🕒 Entry/Exit Log</Typography>
//         {eventLog.length === 0 ? (
//           <Typography>No events yet.</Typography>
//         ) : (
//           <List>
//             {eventLog.map((log, idx) => (
//               <ListItem key={idx}>
//                 <ListItemText
//                   primary={`${log.time} - ${log.type} - ${log.zone}`}
//                 />
//               </ListItem>
//             ))}
//           </List>
//         )}
//       </Box>
//     </Box>
//   );
// };

// export default ZoneManager;

// import React, { useEffect, useRef, useState } from "react";
// import { Box, Typography, Input, Button, Divider } from "@mui/material";
// import * as turf from "@turf/turf";
// import * as geojsonValidation from "geojson-validation";

// const GOOGLE_MAP_API_KEY = process.env.REACT_APP_GOOGLEAPI;
// const ZONE_API = "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zone";
// const ZONES_API =
//   "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zones";
// const DELETE_ZONE_API = (id) =>
//   `https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zone/${id}`;

// const ZoneManager = () => {
//   const mapRef = useRef(null);
//   const markerRef = useRef(null);
//   const mapInstanceRef = useRef(null);

//   const [mapLoaded, setMapLoaded] = useState(false);
//   const [zones, setZones] = useState([]);
//   const [uploadStatus, setUploadStatus] = useState("");
//   const [assetPosition, setAssetPosition] = useState({
//     lat: 40.7825,
//     lng: -73.965,
//   });
//   const [inZone, setInZone] = useState(false);

//   // Load Google Maps JS API
//   useEffect(() => {
//     if (!window.google && !document.getElementById("google-maps-script")) {
//       const script = document.createElement("script");
//       script.id = "google-maps-script";
//       script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAP_API_KEY}&libraries=drawing`;
//       script.async = true;
//       script.defer = true;
//       script.onload = () => setMapLoaded(true);
//       document.body.appendChild(script);
//     } else {
//       setMapLoaded(true);
//     }
//   }, []);

//   useEffect(() => {
//     if (mapLoaded) initMap();
//   }, [mapLoaded]);

//   const initMap = () => {
//     const map = new window.google.maps.Map(mapRef.current, {
//       center: { lat: 40.7829, lng: -73.9654 },
//       zoom: 15,
//     });
//     mapInstanceRef.current = map;

//     const drawingManager = new window.google.maps.drawing.DrawingManager({
//       drawingMode: window.google.maps.drawing.OverlayType.POLYGON,
//       drawingControl: true,
//       drawingControlOptions: {
//         position: window.google.maps.ControlPosition.TOP_CENTER,
//         drawingModes: [window.google.maps.drawing.OverlayType.POLYGON],
//       },
//       polygonOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//     });

//     drawingManager.setMap(map);

//     window.google.maps.event.addListener(
//       drawingManager,
//       "overlaycomplete",
//       async (event) => {
//         if (event.type === "polygon") {
//           const polygon = event.overlay;
//           const coordinates = polygon
//             .getPath()
//             .getArray()
//             .map((latLng) => [latLng.lng(), latLng.lat()]);
//           coordinates.push(coordinates[0]); // close the polygon

//           const geojson = {
//             type: "Polygon",
//             coordinates: [coordinates],
//           };

//           const name = prompt("Enter Zone Name") || "Unnamed Zone";
//           await saveZone(name, geojson);
//         }
//       }
//     );

//     loadZones(map);
//   };

//   const saveZone = async (name, geojson) => {
//     try {
//       const res = await fetch(ZONE_API, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ name, geojson }),
//       });
//       const result = await res.json();
//       alert("Zone saved: " + name);
//       loadZones(); // Refresh map with new zone
//     } catch (err) {
//       console.error("Failed to save zone:", err);
//       alert("❌ Failed to save zone.");
//     }
//   };

//   const loadZones = async (mapInstance) => {
//     try {
//       const res = await fetch(ZONES_API);
//       const data = await res.json();
//       setZones(data);

//       const map = mapInstance || mapInstanceRef.current;

//       data.forEach((zone) => {
//         const polygon = new window.google.maps.Polygon({
//           paths: zone.geojson.coordinates[0].map(([lng, lat]) => ({
//             lat,
//             lng,
//           })),
//           strokeColor: "#FF0000",
//           strokeOpacity: 1,
//           strokeWeight: 2,
//           fillColor: "#FF0000",
//           fillOpacity: 0.2,
//         });
//         polygon.setMap(map);
//       });
//     } catch (err) {
//       console.error("Failed to load zones:", err);
//     }
//   };

//   const handleDelete = async (id) => {
//     try {
//       await fetch(DELETE_ZONE_API(id), { method: "DELETE" });
//       setZones((prev) => prev.filter((z) => z.id !== id));
//       alert("Zone deleted");
//     } catch (err) {
//       console.error("Failed to delete zone:", err);
//     }
//   };

//   const handleFileUpload = async (event) => {
//     const file = event.target.files?.[0];
//     if (!file) return;

//     try {
//       const text = await file.text();
//       const json = JSON.parse(text);

//       if (
//         !geojsonValidation.isPolygon(json) &&
//         !geojsonValidation.isMultiPolygon(json)
//       ) {
//         setUploadStatus("❌ Invalid GeoJSON: Only Polygon or MultiPolygon.");
//         return;
//       }

//       const name =
//         prompt("Enter a name for this zone") ||
//         file.name.replace(".geojson", "");
//       await saveZone(name, json);
//       setUploadStatus(`✅ Zone uploaded: ${name}`);
//     } catch (err) {
//       console.error(err);
//       setUploadStatus("❌ Error reading file or uploading.");
//     }
//   };

//   // 🚀 Simulate asset movement + geofence check
//   // Helper to send alert email via backend
//   const sendAlertEmail = async (subject, message) => {
//     try {
//       const res = await fetch(
//         "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/alert",
//         {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ subject, message }),
//         }
//       );

//       if (res.ok) {
//         console.log("✅ Email sent successfully");
//       } else {
//         const data = await res.json();
//         console.error("❌ Email failed:", data);
//       }
//     } catch (err) {
//       console.error("❌ Error sending email:", err);
//     }
//   };

//   // Inside useEffect() that simulates GPS
//   useEffect(() => {
//     if (!mapLoaded || zones.length === 0 || !mapInstanceRef.current) return;

//     const interval = setInterval(() => {
//       const deltaLat = (Math.random() - 0.5) * 0.0005;
//       const deltaLng = (Math.random() - 0.5) * 0.0005;

//       setAssetPosition((prev) => {
//         const newPos = {
//           lat: prev.lat + deltaLat,
//           lng: prev.lng + deltaLng,
//         };

//         const point = turf.point([newPos.lng, newPos.lat]);
//         let inside = false;

//         for (let zone of zones) {
//           const polygon = turf.polygon(zone.geojson.coordinates);
//           if (turf.booleanPointInPolygon(point, polygon)) {
//             inside = true;
//             break;
//           }
//         }

//         const map = mapInstanceRef.current;

//         if (!markerRef.current) {
//           markerRef.current = new window.google.maps.Marker({
//             map,
//             title: "Asset",
//             icon: {
//               path: window.google.maps.SymbolPath.CIRCLE,
//               scale: 6,
//               fillColor: "#00f",
//               fillOpacity: 1,
//               strokeWeight: 1,
//             },
//           });
//         }

//         markerRef.current.setPosition(
//           new window.google.maps.LatLng(newPos.lat, newPos.lng)
//         );

//         if (inside && !inZone) {
//           const msg = `🚀 Asset ENTERED a geofence at (${newPos.lat}, ${newPos.lng})`;
//           console.log(msg);
//           sendAlertEmail("🚀 Asset ENTERED Zone", msg);
//           setInZone(true);
//         } else if (!inside && inZone) {
//           const msg = `🏃‍♂️ Asset EXITED the geofence at (${newPos.lat}, ${newPos.lng})`;
//           console.log(msg);
//           sendAlertEmail("🏃‍♂️ Asset EXITED Zone", msg);
//           setInZone(false);
//         }

//         return newPos;
//       });
//     }, 1000);

//     return () => clearInterval(interval);
//   }, [zones, mapLoaded, inZone]);

//   return (
//     <Box sx={{ p: 3 }}>
//       <Typography variant="h4" gutterBottom>
//         Zone Manager
//       </Typography>

//       <Box
//         ref={mapRef}
//         style={{ width: "100%", height: "500px", marginBottom: "24px" }}
//       />

//       <Box sx={{ mb: 3 }}>
//         <Typography variant="h6">📂 Upload GeoJSON Zone</Typography>
//         <Input
//           type="file"
//           accept=".geojson,application/geo+json"
//           onChange={handleFileUpload}
//         />
//         {uploadStatus && <Typography mt={1}>{uploadStatus}</Typography>}
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6" gutterBottom>
//           🗂️ Saved Zones
//         </Typography>
//         {zones.length === 0 ? (
//           <Typography>No zones available.</Typography>
//         ) : (
//           zones.map((zone) => (
//             <Box key={zone.id} sx={{ mb: 1 }}>
//               <Typography>{zone.name}</Typography>
//               <Button
//                 variant="outlined"
//                 color="error"
//                 onClick={() => handleDelete(zone.id)}
//               >
//                 Delete Zone
//               </Button>
//             </Box>
//           ))
//         )}
//       </Box>
//     </Box>
//   );
// };

// export default ZoneManager;

// // ZoneManager.js
// import React, { useEffect, useRef, useState } from "react";
// import {
//   Box,
//   Typography,
//   Input,
//   Button,
//   Divider,
//   CircularProgress,
// } from "@mui/material";
// import * as turf from "@turf/turf";
// import * as geojsonValidation from "geojson-validation";

// const GOOGLE_MAP_API_KEY = process.env.REACT_APP_GOOGLEAPI;
// const ZONE_API = "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zone";
// const ZONES_API =
//   "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zones";
// const DELETE_ZONE_API = (id) =>
//   `https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zone/${id}`;

// const ZoneManager = () => {
//   const mapRef = useRef(null);
//   const [mapLoaded, setMapLoaded] = useState(false);
//   const [zones, setZones] = useState([]);
//   const [uploadStatus, setUploadStatus] = useState("");

//   // Load Google Maps API script
//   useEffect(() => {
//     if (!window.google && !document.getElementById("google-maps-script")) {
//       const script = document.createElement("script");
//       script.id = "google-maps-script";
//       script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAP_API_KEY}&libraries=drawing`;
//       script.async = true;
//       script.defer = true;
//       script.onload = () => {
//         setMapLoaded(true);
//       };
//       document.body.appendChild(script);
//     } else {
//       setMapLoaded(true);
//     }
//   }, []);

//   useEffect(() => {
//     if (mapLoaded) initMap();
//   }, [mapLoaded]);

//   const initMap = () => {
//     const map = new window.google.maps.Map(mapRef.current, {
//       center: { lat: 40.7829, lng: -73.9654 },
//       zoom: 15,
//     });

//     const drawingManager = new window.google.maps.drawing.DrawingManager({
//       drawingMode: window.google.maps.drawing.OverlayType.POLYGON,
//       drawingControl: true,
//       drawingControlOptions: {
//         position: window.google.maps.ControlPosition.TOP_CENTER,
//         drawingModes: [window.google.maps.drawing.OverlayType.POLYGON],
//       },
//       polygonOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//     });

//     drawingManager.setMap(map);

//     window.google.maps.event.addListener(
//       drawingManager,
//       "overlaycomplete",
//       async (event) => {
//         if (event.type === "polygon") {
//           const polygon = event.overlay;

//           const coordinates = polygon
//             .getPath()
//             .getArray()
//             .map((latLng) => [latLng.lng(), latLng.lat()]);

//           coordinates.push(coordinates[0]); // close the polygon

//           const geojson = {
//             type: "Polygon",
//             coordinates: [coordinates],
//           };

//           const name = prompt("Enter Zone Name") || "Unnamed Zone";

//           await saveZone(name, geojson);
//         }
//       }
//     );

//     loadZones(map);
//   };

//   const saveZone = async (name, geojson) => {
//     try {
//       const res = await fetch(ZONE_API, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ name, geojson }),
//       });

//       const result = await res.json();
//       alert("Zone saved: " + name);
//       loadZones(); // Refresh after save
//     } catch (err) {
//       console.error("Failed to save zone:", err);
//       alert("Failed to save zone.");
//     }
//   };

//   const loadZones = async (mapInstance) => {
//     try {
//       const res = await fetch(ZONES_API);
//       const data = await res.json();
//       setZones(data);

//       if (mapInstance || mapRef.current) {
//         const map =
//           mapInstance || new window.google.maps.Map(mapRef.current, {});
//         data.forEach((zone) => {
//           const polygon = new window.google.maps.Polygon({
//             paths: zone.geojson.coordinates[0].map(([lng, lat]) => ({
//               lat,
//               lng,
//             })),
//             strokeColor: "#FF0000",
//             strokeOpacity: 1,
//             strokeWeight: 2,
//             fillColor: "#FF0000",
//             fillOpacity: 0.2,
//           });
//           polygon.setMap(map);
//         });
//       }
//     } catch (err) {
//       console.error("Failed to load zones:", err);
//     }
//   };

//   const handleDelete = async (id) => {
//     try {
//       await fetch(DELETE_ZONE_API(id), { method: "DELETE" });
//       setZones((prev) => prev.filter((z) => z.id !== id));
//     } catch (err) {
//       console.error("Failed to delete zone:", err);
//     }
//   };

//   const handleFileUpload = async (event) => {
//     const file = event.target.files?.[0];
//     if (!file) return;

//     try {
//       const text = await file.text();
//       const json = JSON.parse(text);

//       if (
//         !geojsonValidation.isPolygon(json) &&
//         !geojsonValidation.isMultiPolygon(json)
//       ) {
//         setUploadStatus("❌ Invalid GeoJSON: Only Polygon or MultiPolygon.");
//         return;
//       }

//       const name =
//         prompt("Enter a name for this zone") ||
//         file.name.replace(".geojson", "");

//       await saveZone(name, json);
//       setUploadStatus(`✅ Zone uploaded: ${name}`);
//     } catch (err) {
//       console.error(err);
//       setUploadStatus("❌ Error reading file or uploading.");
//     }
//   };

//   return (
//     <Box sx={{ p: 3 }}>
//       <Typography variant="h4" gutterBottom>
//         Zone Manager
//       </Typography>

//       <Box
//         ref={mapRef}
//         style={{ width: "100%", height: "500px", marginBottom: "24px" }}
//       />

//       <Box sx={{ mb: 3 }}>
//         <Typography variant="h6">📂 Upload GeoJSON Zone</Typography>
//         <Input
//           type="file"
//           accept=".geojson,application/geo+json"
//           onChange={handleFileUpload}
//         />
//         {uploadStatus && <Typography mt={1}>{uploadStatus}</Typography>}
//       </Box>

//       <Divider sx={{ my: 3 }} />

//       <Box>
//         <Typography variant="h6" gutterBottom>
//           🗂️ Saved Zones
//         </Typography>
//         {zones.length === 0 ? (
//           <Typography>No zones available.</Typography>
//         ) : (
//           zones.map((zone) => (
//             <Box key={zone.id} sx={{ mb: 1 }}>
//               <Typography>{zone.name}</Typography>
//               <Button
//                 variant="outlined"
//                 color="error"
//                 onClick={() => handleDelete(zone.id)}
//               >
//                 Delete Zone
//               </Button>
//             </Box>
//           ))
//         )}
//       </Box>
//     </Box>
//   );
// };

// export default ZoneManager;

// import React, { useEffect, useRef, useState } from "react";

// // const GOOGLE_MAP_API_KEY = "REACT_APP_GOOGLEAPI"; // 🔐 Replace with your key
// const ZONE_API_URL =
//   "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zone";

// const MapWithDraw = () => {
//   const mapRef = useRef(null);
//   const [mapLoaded, setMapLoaded] = useState(false);

//   useEffect(() => {
//     if (!window.google && !document.getElementById("google-maps-script")) {
//       const script = document.createElement("script");
//       script.id = "google-maps-script";
//       script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.REACT_APP_GOOGLEAPI}&libraries=drawing`;
//       script.async = true;
//       script.defer = true;
//       script.onload = () => {
//         window.initMap = initMap;
//         setMapLoaded(true);
//       };
//       document.body.appendChild(script);
//     } else {
//       setMapLoaded(true);
//     }
//   }, []);

//   const initMap = () => {
//     if (!mapRef.current) return;

//     const map = new window.google.maps.Map(mapRef.current, {
//       center: { lat: 40.7829, lng: -73.9654 }, // Central Park default
//       zoom: 15,
//     });

//     const drawingManager = new window.google.maps.drawing.DrawingManager({
//       drawingMode: window.google.maps.drawing.OverlayType.POLYGON,
//       drawingControl: true,
//       drawingControlOptions: {
//         position: window.google.maps.ControlPosition.TOP_CENTER,
//         drawingModes: [window.google.maps.drawing.OverlayType.POLYGON],
//       },
//       polygonOptions: {
//         fillColor: "#2196F3",
//         fillOpacity: 0.4,
//         strokeWeight: 2,
//         clickable: true,
//         editable: false,
//         zIndex: 1,
//       },
//     });

//     drawingManager.setMap(map);

//     window.google.maps.event.addListener(
//       drawingManager,
//       "overlaycomplete",
//       async (event) => {
//         if (event.type === "polygon") {
//           const polygon = event.overlay;

//           const coordinates = polygon
//             .getPath()
//             .getArray()
//             .map((latLng) => [latLng.lng(), latLng.lat()]); // [lng, lat] order for GeoJSON

//           coordinates.push(coordinates[0]); // close the polygon

//           const geojson = {
//             type: "Polygon",
//             coordinates: [coordinates],
//           };

//           const zoneData = {
//             name: prompt("Enter Zone Name") || "Unnamed Zone",
//             geojson,
//           };

//           try {
//             const res = await fetch(ZONE_API_URL, {
//               method: "POST",
//               headers: {
//                 "Content-Type": "application/json",
//               },
//               body: JSON.stringify(zoneData),
//             });

//             const result = await res.json();
//             alert("Zone saved: " + JSON.stringify(result));
//           } catch (err) {
//             alert("Failed to save zone");
//             console.error(err);
//           }
//         }
//       }
//     );
//   };

//   useEffect(() => {
//     if (mapLoaded) initMap();
//   }, [mapLoaded]);

//   return <div ref={mapRef} style={{ width: "100%", height: "600px" }} />;
// };

// export default MapWithDraw;
