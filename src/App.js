import "./App.css";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import Header from "./Components/Header";
import Home from "./Components/Home";
import AddGeoMap from "./Components/AddGeoMap";
import ViewAllMaps from "./Components/ViewAllMaps";
import MapWithDraw from "./Components/MapWithDraw";
import GeoJsonUploader from "./Components/GeoJsonUploader";
import GeoJsonManager from "./Components/GeoJsonManager";

function App() {
  return (
    <div className="App">
      <Router>
        {/* <GeoJsonUploader /> */}
        {/* <GeoJsonManager /> */}
        <Header />
        {/* <Home /> */}
        <MapWithDraw />
        {/* <Switch>
          <Route exact path="/" component={Home} />
          <Route path="/map/:name" component={AddGeoMap} />
          <Route path="/viewAllMaps" component={ViewAllMaps} />
        </Switch>{" "} */}
      </Router>
    </div>
  );
}
export default App;
