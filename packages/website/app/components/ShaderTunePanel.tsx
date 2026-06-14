import { useEffect, useState, type CSSProperties } from "react";
import { useShader } from "../contexts/shader-context";
import { PARAM_DEFS } from "../lib/shaders";

// Temporary live-tuning panel for the shader wallpaper. Hidden for normal
// visitors; enable by appending ?tune=1 to the URL (it then sticks via
// localStorage). Adjust the sliders, hit "copy JSON", and send the values so
// they can be hardcoded into PARAM_DEFS.
export default function ShaderTunePanel() {
  const { params, setParam, resetParams } = useShader();
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const hasParam = new URLSearchParams(window.location.search).has("tune");
      if (hasParam) localStorage.setItem("shaderTune", "1");
      setVisible(hasParam || localStorage.getItem("shaderTune") === "1");
    } catch {
      // ignore
    }
  }, []);

  if (!visible) return null;

  const copy = () => {
    const text = JSON.stringify(params, null, 2);
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  const hide = () => {
    try {
      localStorage.removeItem("shaderTune");
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <strong>shader tune</strong>
        <span style={{ display: "flex", gap: 6 }}>
          <button style={btnStyle} onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? "+" : "–"}
          </button>
          <button style={btnStyle} onClick={hide}>
            ✕
          </button>
        </span>
      </div>
      {!collapsed && (
        <>
          {PARAM_DEFS.map((d) => {
            const value = params[d.key] ?? d.value;
            return (
              <label key={d.key} style={{ display: "block", marginBottom: 6 }}>
                <span style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{d.label}</span>
                  <span>{value.toFixed(d.step < 1 ? 3 : 0)}</span>
                </span>
                <input
                  type="range"
                  min={d.min}
                  max={d.max}
                  step={d.step}
                  value={value}
                  onChange={(e) => setParam(d.key, parseFloat(e.target.value))}
                  style={{ width: "100%" }}
                />
              </label>
            );
          })}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button style={{ ...btnStyle, flex: 1 }} onClick={copy}>
              {copied ? "copied!" : "copy JSON"}
            </button>
            <button style={{ ...btnStyle, flex: 1 }} onClick={resetParams}>
              reset
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const panelStyle: CSSProperties = {
  position: "fixed",
  top: 8,
  left: 8,
  zIndex: 9999,
  width: 230,
  maxHeight: "92vh",
  overflowY: "auto",
  background: "rgba(20,20,24,0.92)",
  color: "#eee",
  font: "11px/1.4 ui-monospace, monospace",
  borderRadius: 8,
  padding: 10,
  boxShadow: "0 4px 20px rgba(0,0,0,.4)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const btnStyle: CSSProperties = {
  background: "#33343a",
  color: "#eee",
  border: "1px solid #4a4b52",
  borderRadius: 4,
  padding: "3px 8px",
  cursor: "pointer",
  font: "11px/1 ui-monospace, monospace",
};
