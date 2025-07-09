import React, { useState } from "react";
import { Box, Button, Typography, Input } from "@mui/material";
import * as geojsonValidation from "geojson-validation";

const GEOJSON_API =
  "https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zone";

const GeoJsonUploader = () => {
  const [uploadStatus, setUploadStatus] = useState(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (
        !geojsonValidation.isPolygon(json) &&
        !geojsonValidation.isMultiPolygon(json)
      ) {
        setUploadStatus(
          "❌ Invalid GeoJSON: Only Polygon or MultiPolygon supported."
        );
        return;
      }

      const name =
        prompt("Enter a name for this zone") ||
        file.name.replace(".geojson", "");

      const response = await fetch(GEOJSON_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, geojson: json }),
      });

      const result = await response.json();
      if (response.ok) {
        setUploadStatus(`✅ Zone uploaded: ${name}`);
      } else {
        setUploadStatus("❌ Failed to upload: " + result.error);
      }
    } catch (err) {
      console.error(err);
      setUploadStatus("❌ Error reading file or uploading.");
    }
  };

  return (
    <Box sx={{ p: 3, border: "1px dashed grey", borderRadius: 2 }}>
      <Typography variant="h6">Upload GeoJSON Zone</Typography>
      <Input
        type="file"
        accept=".geojson,application/geo+json"
        onChange={handleFileUpload}
      />
      {uploadStatus && <Typography sx={{ mt: 2 }}>{uploadStatus}</Typography>}
    </Box>
  );
};

export default GeoJsonUploader;
