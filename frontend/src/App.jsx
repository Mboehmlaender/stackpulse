import React, { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [stacks, setStacks] = useState([]);

  useEffect(() => {
    axios.get("/api/stacks").then(res => setStacks(res.data));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">StackPulse</h1>
      <ul className="list-disc pl-5">
        {stacks.map((stack, i) => (
          <li key={i}>{stack.name}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;
