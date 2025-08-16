const express = require("express");
const axios = require("axios");
const app = express();
const PORT = 3000;

app.get("/api/stacks", async (req, res) => {
  try {
    res.json([{ name: "stack1" }, { name: "stack2" }]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(\`Backend läuft auf http://localhost:\${PORT}\`);
});
