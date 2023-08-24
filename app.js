const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const convertDbObjToResObjState = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertToDbObjToResObjDis = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    request.status(401);
    request.send("Invalid JWT Token");
  } else {
    await jwt.verify(jwtToken, "token1", async (err, payload) => {
      if (err) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//Login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `select * from user where username = '${username}';`;
  const user = await db.get(checkUserQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isMatched = await bcrypt.compare(password, user.password);
    if (isMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "token1");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `select * from state order by state_id;`;
  const stateListArray = await db.all(getStatesQuery);
  response.send(
    stateListArray.map((eachState) => convertDbObjToResObjState(eachState))
  );
});

app.get("/states/:stateId", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `select * from state where state_id = ${stateId};`;
  const state = await db.get(getStateQuery);
  response.send(convertDbObjToResObjState(state));
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const postDisQuery = `insert into district
    (district_name, state_id, cases, cured, active, deaths) values 
    ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`;
  await db.run(postDisQuery);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `select * from district where 
    district_id = ${districtId};`;
    const district = await db.get(getDistrictQuery);
    response.send(convertToDbObjToResObjDis(district));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDisQuery = `delete from district where district_id = ${districtId};`;
    await db.run(deleteDisQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDisQuery = `update district set 
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases}, 
    cured = ${cured},
    active = ${active},
    deaths = ${deaths} 
    where district = ${districtId};`;
    await db.run(updateDisQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStatsQuery = `select 
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths) from district where state_id = ${stateId};`;
    const stats = await db.get(getStatsQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
