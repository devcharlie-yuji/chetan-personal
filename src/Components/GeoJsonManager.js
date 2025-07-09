// GeoJsonManager.js
import React, { useEffect, useState, useRef } from "react";
import { Box, Typography, Button } from "@mui/material";
import { GoogleMap, LoadScript, Polygon } from "@react-google-maps/api";
import * as turf from "@turf/turf";

const ZONES_API =
  "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zones";
const DELETE_ZONE_API = (id) =>
  `https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zone/${id}`;

const containerStyle = {
  width: "100%",
  height: "500px",
};

const center = {
  lat: 40.7829,
  lng: -73.9654,
};

const GeoJsonManager = () => {
  const [zones, setZones] = useState([]);
  const mapRef = useRef(null);

  const fetchZones = async () => {
    try {
      const res = await fetch(ZONES_API);
      const data = await res.json();
      setZones(data); // Assume data is an array [{ id, name, geojson }]
    } catch (err) {
      console.error("Failed to load zones:", err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(DELETE_ZONE_API(id), { method: "DELETE" });
      setZones(zones.filter((z) => z.id !== id));
    } catch (err) {
      console.error("Failed to delete zone:", err);
    }
  };

  const checkIfPointInsideZone = (point) => {
    for (let zone of zones) {
      const polygon = turf.polygon(zone.geojson.coordinates);
      if (turf.booleanPointInPolygon(point, polygon)) {
        return zone.name;
      }
    }
    return null;
  };

  useEffect(() => {
    fetchZones();
  }, []);

  return (
    <Box>
      <Typography variant="h6">Saved Zones Map</Typography>
      <LoadScript googleMapsApiKey={"AIzaSyBd4w2QpIz_R7y6NvKec232IOcYW5RJXCI"}>
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={center}
          zoom={14}
          onLoad={(map) => (mapRef.current = map)}
        >
          {zones.map((zone, index) => (
            <Polygon
              key={index}
              paths={zone.geojson.coordinates[0].map(([lng, lat]) => ({
                lat,
                lng,
              }))}
              options={{
                fillColor: "#FF0000",
                fillOpacity: 0.2,
                strokeColor: "#FF0000",
                strokeOpacity: 1,
                strokeWeight: 2,
              }}
            />
          ))}
        </GoogleMap>
      </LoadScript>
      <Box mt={2}>
        {zones.map((zone) => (
          <Box key={zone.id} sx={{ mb: 1 }}>
            <Typography>{zone.name}</Typography>
            <Button
              variant="outlined"
              color="error"
              onClick={() => handleDelete(zone.id)}
            >
              Delete Zone
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default GeoJsonManager;
