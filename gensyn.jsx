// Gensyn Web Monitor (single-file React component)
// -------------------------------------------------
// What this file is: a single React component you can drop into a React app.
// It provides a small web UI where the user can enter an EOA or a Peer ID
// to fetch ranking/stats from the same contract + gswarm API used in your script.
// It intentionally DOES NOT fetch node logs.
//
// Requirements / notes:
// - Needs a React app (Create React App, Vite, Next.js, etc.)
// - Install ethers: `npm install ethers`
// - Tailwind recommended for styling (this file uses Tailwind classes). If you don't
//   have Tailwind, the layout will still work but without Tailwind styles.
// - CORS: the Alchemy public RPC and gswarm.dev must allow requests from your origin.
//   If either endpoint blocks CORS, run this component in a small server-side proxy
//   or convert to a server-side (Flask/Express) implementation.

import React, { useState } from "react";
import { ethers } from "ethers";

const ALCHEMY_RPC = "https://gensyn-testnet.g.alchemy.com/public";
const CONTRACT_ADDRESS = "0xFaD7C5e93f28257429569B854151A1B8DCD404c2";
const ABI = [
  {
    name: "getPeerId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "eoaAddresses", type: "address[]" }],
    outputs: [{ name: "", type: "string[][]" }],
  },
];

function formatLastSeen(isoString) {
  if (!isoString) return "N/A";
  try {
    const d = new Date(isoString);
    const ist = d.toLocaleString("en-GB", { timeZone: "Asia/Kolkata" });

    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${ist} (${mins}m ago)`;
    const hrs = Math.floor(mins / 60);
    return `${ist} (${hrs}h ago)`;
  } catch (e) {
    return isoString;
  }
}

export default function GensynWebMonitor() {
  const [mode, setMode] = useState("eoa"); // 'eoa' or 'peer'
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handleCheck(e) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError("Enter an EOA or Peer ID first.");
      return;
    }

    setLoading(true);
    try {
      let peerIds = [];

      if (mode === "eoa") {
        // Call contract to convert EOA -> peerIds
        const provider = new ethers.providers.JsonRpcProvider(ALCHEMY_RPC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

        // simple checksum/validation
        let eoa = trimmed;
        if (!ethers.utils.isAddress(eoa)) {
          setError("Invalid EOA address format.");
          setLoading(false);
          return;
        }
        eoa = ethers.utils.getAddress(eoa);

        try {
          const raw = await contract.getPeerId([eoa]);
          // contract returns string[][] in original script; pick first array
          if (Array.isArray(raw) && raw.length > 0) {
            peerIds = raw[0].filter(Boolean);
          }
        } catch (cErr) {
          // If contract call fails, report but allow the user to continue
          setError("Contract call failed: " + (cErr?.message || cErr));
          setLoading(false);
          return;
        }
      } else {
        // mode === 'peer'
        peerIds = [trimmed];
      }

      if (!peerIds || peerIds.length === 0) {
        setError("No peer IDs found for the provided input.");
        setLoading(false);
        return;
      }

      // Call the gswarm API for stats
      const payload = { peerIds };
      const r = await fetch("https://gswarm.dev/api/user/data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-By": "gensyn-web-ui",
        },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const text = await r.text();
        throw new Error(`gswarm API error: ${r.status} ${text}`);
      }

      const data = await r.json();

      // Massage the result for display
      const ranks = data.ranks || [];
      const stats = data.stats || {};

      setResult({ peerIds, ranks, stats });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Gensyn — quick peer/EOA lookup</h1>

      <form onSubmit={handleCheck} className="bg-white p-4 rounded-lg shadow">
        <div className="mb-3 flex gap-3 items-center">
          <label className="inline-flex items-center">
            <input
              type="radio"
              name="mode"
              value="eoa"
              checked={mode === "eoa"}
              onChange={() => setMode("eoa")}
              className="mr-2"
            />
            EOA address
          </label>
          <label className="inline-flex items-center">
            <input
              type="radio"
              name="mode"
              value="peer"
              checked={mode === "peer"}
              onChange={() => setMode("peer")}
              className="mr-2"
            />
            Peer ID
          </label>
        </div>

        <div className="mb-3">
          <input
            className="w-full border rounded px-3 py-2"
            placeholder={mode === "eoa" ? "0xYourEOAAddress" : "peer-id-here"}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
          >
            {loading ? "Checking..." : "Check"}
          </button>

          <button
            type="button"
            onClick={() => {
              setInputValue("");
              setError(null);
              setResult(null);
            }}
            className="px-4 py-2 border rounded"
          >
            Clear
          </button>
        </div>

        {error && <div className="mt-3 text-red-600">Error: {error}</div>}
      </form>

      {result && (
        <div className="mt-6 bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Results</h2>

          <div className="mb-2">
            <strong>Queried Peer IDs:</strong>
            <ul className="list-disc list-inside mt-1">
              {result.peerIds.map((p) => (
                <li key={p} className="font-mono text-sm break-all">{p}</li>
              ))}
            </ul>
          </div>

          <div className="mb-2">
            <strong>Stats:</strong>
            <div className="mt-1 text-sm">
              Total Nodes: {result.stats.totalNodes ?? "-"}, Ranked Nodes: {result.stats.rankedNodes ?? "-"}
            </div>
          </div>

          <div className="mt-3">
            <strong>Ranks:</strong>
            {result.ranks.length === 0 && <div className="text-sm">No ranks returned.</div>}
            {result.ranks.map((r) => (
              <div key={r.peerId} className="border rounded p-3 my-2">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <div className="text-sm font-mono break-all">Peer ID: {r.peerId}</div>
                    <div>EOA: <span className="font-mono">{r.eoa ?? "-"}</span></div>
                  </div>
                  <div className="text-right">
                    <div>🏆 Rank: {r.rank}</div>
                    <div>🎯 Wins: {r.totalWins}</div>
                    <div>💰 Rewards: {r.totalRewards}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-600">Last Seen: {formatLastSeen(r.lastSeen)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 text-sm text-gray-500">
        Note: this UI calls the Gensyn contract via the public Alchemy RPC and the gswarm.dev API. If you run into CORS
        issues, either run this behind a small server proxy or I can provide a server-side version (Flask/Express).
      </div>
    </div>
  );
}
