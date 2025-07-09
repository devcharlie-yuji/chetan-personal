import React, { useEffect, useState } from "react";
import { Button, Table } from "react-bootstrap";
import axios from "axios";
import { useHistory } from "react-router-dom";
import Map1 from "./Map1"; // assuming this renders a row for a place

export default function Home() {
  const history = useHistory();

  const [name, setName] = useState("");
  const [allMaps, setAllMaps] = useState([]); // Places
  const [allZones, setAllZones] = useState([]); // Zones

  const [latitude, setLatitude] = useState("");
  const [longitude, setlongitude] = useState("");

  const addName = async () => {
    var place = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${name}&key=${process.env.REACT_APP_GOOGLEAPI}`
    )
      .then((resp) => resp.json())
      .then((data) => data);

    if (place && place.results.length > 0) {
      const lat = place.results[0].geometry.location.lat;
      const lng = place.results[0].geometry.location.lng;

      setLatitude(lat);
      setlongitude(lng);

      axios
        .post("https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/place", {
          name: name,
          latitude: lat,
          longitude: lng,
        })
        .then((response) => {
          if (response) {
            history.push(`/map/${name}`);
          }
        })
        .catch((err) => console.log(err));
    } else {
      alert("Entered place is not valid! Try again");
    }
  };

  const getAllMaps = () => {
    axios
      .get("https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/places")
      .then((response) => {
        if (response) {
          setAllMaps(response.data);
        }
      })
      .catch((err) => console.log(err));
  };

  const getAllZones = () => {
    axios
      .get("https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zones")
      .then((response) => {
        if (response) {
          setAllZones(response.data);
        }
      })
      .catch((err) => console.log(err));
  };

  useEffect(() => {
    getAllMaps();
    getAllZones();

    return () => {
      setAllMaps([]);
      setAllZones([]);
    };
  }, []);

  return (
    <div>
      <div style={{ marginTop: "10px" }}></div>
      <input
        type="text"
        placeholder="Search..."
        onChange={(e) => setName(e.target.value)}
        value={name}
        className="searchtext"
      />
      &nbsp;
      <Button
        className="btn btn-primary searchbtn"
        style={{ borderRadius: "5px" }}
        disabled={name === ""}
        onClick={addName}
      >
        Add
      </Button>
      <br />
      <h3>Place List</h3>
      <Table striped bordered hover className="w-90">
        <thead>
          <tr>
            <th>ID</th>
            <th>PLACE</th>
            <th>LATITUDE</th>
            <th>LONGITUDE</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {allMaps.map((map, index) => (
            <Map1
              key={map.id}
              id={map.id}
              name={map.name}
              latitude={map.latitude}
              longitude={map.longitude}
              index={index}
              map={map}
            />
          ))}
        </tbody>
      </Table>
      <br />
      <h3>Zone List</h3>
      <Table striped bordered hover className="w-90">
        <thead>
          <tr>
            <th>ID</th>
            <th>NAME</th>
            <th>TYPE</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {allZones.map((zone, index) => (
            <tr key={zone.id}>
              <td>{zone.id}</td>
              <td>{zone.name}</td>
              <td>{zone.geojson.type}</td>
              {/* <td>{zone.geojson.coordinates}</td> */}
              <td>
                {/* You can add view/delete buttons here */}
                <Button size="sm" onClick={() => console.log("View", zone)}>
                  View
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

// import React, { useEffect, useState } from "react";
// import { Button, Table } from "react-bootstrap";
// import axios from "axios";
// import { useHistory } from "react-router-dom";
// import Map1 from "./Map1";

// export default function Home() {
//   const history = useHistory();
//   const [name, setName] = useState("");
//   const [allMaps, setAllMaps] = useState([]);

//   let message = "";

//   const [latitude, setLatitude] = useState("");
//   const [longitude, setlongitude] = useState("");

//   const addName = async () => {
//     var place = await fetch(
//       `https://maps.googleapis.com/maps/api/geocode/json?address=${name}&key=${process.env.REACT_APP_GOOGLEAPI}`
//     )
//       .then((resp) => resp.json())
//       .then((data) => {
//         return data;
//       });

//     if (place && place.results.length > 0) {
//       await setLatitude(place.results[0].geometry.location.lat);
//       await setlongitude(place.results[0].geometry.location.lng);

//       // if(latitude && longitude){
//       await axios
//         .post("https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/place", {
//           name: name,
//           latitude: place.results[0].geometry.location.lat,
//           longitude: place.results[0].geometry.location.lng,
//         })

//         .then((response) => {
//           if (response) {
//             message = response.data.msg;
//             history.push(`/map/${name}`);
//           }
//         })
//         .catch((err) => console.log(err));
//       //}

//       // else{
//       //  console.log("Something went wrong");
//       // }
//     } else {
//       alert("Entered place is not valid! Try again");
//     }
//   };

//   const getAllMaps = () => {
//     axios
//       .get("https://pzp4rxjond.execute-api.us-east-1.amazonaws.com/zones")

//       .then((response) => {
//         if (response) {
//           setAllMaps(response.data);
//         }
//       })
//       .catch((err) => console.log(err));
//   };

//   useEffect(() => {
//     let unmounted = false;
//     setTimeout(() => {
//       getAllMaps();
//     }, 1000);
//     return () => {
//       unmounted = true;
//       setAllMaps([]);
//     };
//   }, []);

//   //console.log(allMaps)

//   return (
//     <div>
//       <div style={{ marginTop: "10px" }}></div>
//       <br />
//       <input
//         type="text"
//         placeholder="Search..."
//         onChange={(e) => setName(e.target.value)}
//         value={name}
//         className="searchtext"
//       />
//       &nbsp;
//       <Button
//         className="btn btn-primary searchbtn"
//         style={{ borderRadius: "5px" }}
//         disabled={name === "" ? true : false}
//         onClick={addName}
//       >
//         Add
//       </Button>
//       <br />
//       <h3>Map List</h3>
//       <div>
//         <Table striped bordered hover className="w-90">
//           <thead>
//             <tr>
//               <th>ID</th>
//               <th>PLACE</th>
//               <th>LATITUDE</th>
//               <th>LONGITUDE</th>
//               <th>ACTIONS</th>
//             </tr>
//           </thead>

//           <tbody>
//             {allMaps.map((map, index) => (
//               <Map1
//                 key={map.id}
//                 id={map.id}
//                 name={map.name}
//                 index={index}
//                 map={map}
//               />
//             ))}
//           </tbody>
//         </Table>
//       </div>
//     </div>
//   );
// }
