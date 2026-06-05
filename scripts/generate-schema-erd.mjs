import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");
const outputPath = path.join(projectRoot, "docs", "schema-erd.html");

const SCALAR_TYPES = new Set([
  "BigInt",
  "Boolean",
  "Bytes",
  "DateTime",
  "Decimal",
  "Float",
  "Int",
  "Json",
  "String",
]);

const DOMAIN_GROUPS = [
  {
    name: "Identity and Access",
    color: "#2563eb",
    models: [
      "Account",
      "AuthIdentity",
      "Session",
      "SessionRevocation",
      "Role",
      "Permission",
      "PermissionGrant",
      "RoleAssignment",
      "AccountRecoveryRequest",
      "AccessBootstrap",
    ],
  },
  {
    name: "Organization",
    color: "#059669",
    models: ["Unit", "Rank", "Billet", "StaffSection", "MOS"],
  },
  {
    name: "Personnel",
    color: "#7c3aed",
    models: [
      "PersonnelProfile",
      "PersonnelStatusHistory",
      "PersonnelRankHistory",
      "PersonnelUnitAssignment",
      "PersonnelBilletAssignment",
      "PersonnelMOSHistory",
      "StaffAssignment",
      "PersonnelStandingHistory",
    ],
  },
  {
    name: "Recruiting",
    color: "#dc2626",
    models: [
      "Application",
      "ApplicationAnswer",
      "ApplicationStatusHistory",
      "ApplicationReviewNote",
    ],
  },
  {
    name: "Operations",
    color: "#0891b2",
    models: ["EventTemplate", "Event", "EventAttendance", "LoaRequest"],
  },
  {
    name: "Training",
    color: "#ca8a04",
    models: [
      "TrainingCourse",
      "Qualification",
      "CourseQualification",
      "TrainingRecord",
      "PersonnelQualification",
    ],
  },
  {
    name: "Service Records",
    color: "#c2410c",
    models: [
      "PromotionRequest",
      "PromotionRecord",
      "Award",
      "AwardRequest",
      "AwardRecord",
      "DisciplinaryRecord",
      "AdministrativeNote",
    ],
  },
  {
    name: "Support and System",
    color: "#475569",
    models: ["SupportTicket", "SupportTicketComment", "Notification", "AuditLog", "IntegrationLog"],
  },
];

const schema = await readFile(schemaPath, "utf8");
const enums = parseEnums(schema);
const enumNames = new Set(enums.map((item) => item.name));
const models = parseModels(schema);
const modelNames = new Set(models.map((item) => item.name));
const domainByModel = buildDomainMap();

for (const model of models) {
  model.domain = domainByModel.get(model.name)?.name ?? "Other";
  model.color = domainByModel.get(model.name)?.color ?? "#64748b";
  for (const field of model.fields) {
    field.kind = resolveFieldKind(field.baseType, modelNames, enumNames);
  }
}

const relations = buildRelations(models);

const data = {
  generatedAt: new Date().toISOString(),
  source: path.relative(projectRoot, schemaPath).replaceAll("\\", "/"),
  models,
  enums,
  relations,
  domains: DOMAIN_GROUPS.map(({ name, color }) => ({ name, color })),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, renderHtml(data), "utf8");

console.log(`Generated ${path.relative(projectRoot, outputPath)}`);
console.log(
  `${models.length} models, ${relations.length} explicit relations, ${enums.length} enums`,
);

function parseEnums(source) {
  const result = [];
  const enumPattern = /^enum\s+(\w+)\s*\{([\s\S]*?)^}/gm;
  for (const match of source.matchAll(enumPattern)) {
    const values = match[2]
      .split(/\r?\n/)
      .map((line) => stripInlineComment(line).trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/)[0]);
    result.push({ name: match[1], values });
  }
  return result;
}

function parseModels(source) {
  const result = [];
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^}/gm;
  for (const match of source.matchAll(modelPattern)) {
    const fields = [];
    const attributes = [];
    for (const rawLine of match[2].split(/\r?\n/)) {
      const line = stripInlineComment(rawLine).trim();
      if (!line) continue;
      if (line.startsWith("@@")) {
        attributes.push(line);
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const [name, type, ...restParts] = parts;
      const attributesText = restParts.join(" ");
      const baseType = type.replace("[]", "").replace("?", "");
      const relation = parseRelation(attributesText);
      fields.push({
        name,
        type,
        baseType,
        isList: type.endsWith("[]"),
        isOptional: type.endsWith("?"),
        isId: attributesText.includes("@id"),
        isUnique: attributesText.includes("@unique"),
        defaultValue: parseDefault(attributesText),
        dbType: parseDbType(attributesText),
        relation,
        raw: line,
      });
    }

    result.push({
      name: match[1],
      fields,
      attributes,
    });
  }
  return result;
}

function stripInlineComment(line) {
  const index = line.indexOf("//");
  return index === -1 ? line : line.slice(0, index);
}

function parseDefault(text) {
  const match = text.match(/@default\(([^)]*(?:\)[^)]*)?)\)/);
  return match?.[1] ?? null;
}

function parseDbType(text) {
  const match = text.match(/@db\.(\w+)/);
  return match?.[1] ?? null;
}

function parseRelation(text) {
  if (!text.includes("@relation")) return null;
  const match = text.match(/@relation\((.*)\)/);
  if (!match) return { name: null, fields: [], references: [] };

  const body = match[1];
  const name = body.match(/^"([^"]+)"/)?.[1] ?? null;
  return {
    name,
    fields: parseBracketList(body, "fields"),
    references: parseBracketList(body, "references"),
  };
}

function parseBracketList(text, key) {
  const match = text.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  if (!match) return [];
  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveFieldKind(baseType, names, enumSet) {
  if (SCALAR_TYPES.has(baseType)) return "scalar";
  if (enumSet.has(baseType)) return "enum";
  if (names.has(baseType)) return "relation";
  return "unknown";
}

function buildDomainMap() {
  const map = new Map();
  for (const group of DOMAIN_GROUPS) {
    for (const model of group.models) {
      map.set(model, { name: group.name, color: group.color });
    }
  }
  return map;
}

function buildRelations(modelList) {
  const relations = [];
  const names = new Set(modelList.map((model) => model.name));
  const modelByName = new Map(modelList.map((model) => [model.name, model]));

  for (const model of modelList) {
    for (const field of model.fields) {
      if (!names.has(field.baseType) || !field.relation?.fields?.length) continue;
      const fkUnique = relationForeignKeyIsUnique(model, field.relation.fields);
      relations.push({
        id: `${model.name}.${field.name}`,
        from: model.name,
        to: field.baseType,
        field: field.name,
        relationName: field.relation.name,
        fields: field.relation.fields,
        references: field.relation.references,
        optional: field.isOptional,
        cardinality: fkUnique ? "1:1" : "N:1",
        fromDomain: model.domain,
        toDomain: modelByName.get(field.baseType)?.domain ?? "Other",
      });
    }
  }

  return relations;
}

function relationForeignKeyIsUnique(model, fieldNames) {
  if (!fieldNames.length) return false;
  if (fieldNames.some((name) => model.fields.find((field) => field.name === name)?.isUnique)) {
    return true;
  }
  const fieldSet = fieldNames.join(", ");
  return model.attributes.some((attribute) => {
    const unique = attribute.match(/@@(?:unique|id)\(\[([^\]]+)\]/);
    if (!unique) return false;
    return (
      unique[1]
        .split(",")
        .map((item) => item.trim())
        .join(", ") === fieldSet
    );
  });
}

function renderHtml(erdData) {
  const dataJson = JSON.stringify(erdData).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Prisma Schema ERD</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --panel: #ffffff;
      --panel-2: #eef2f7;
      --ink: #0f172a;
      --muted: #64748b;
      --line: #d8e0ea;
      --strong-line: #94a3b8;
      --focus: #2563eb;
      --shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
      font-family:
        Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      min-height: 100vh;
    }

    header {
      height: 72px;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 18px;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
    }

    h1 {
      font-size: 18px;
      line-height: 1.2;
      margin: 0;
      white-space: nowrap;
    }

    .stat-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 220px;
    }

    .stat {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 4px 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fafc;
      color: var(--muted);
      font-size: 12px;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      min-width: 0;
    }

    input,
    select,
    button {
      height: 36px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
      color: var(--ink);
      font: inherit;
      font-size: 13px;
    }

    input,
    select {
      padding: 0 10px;
    }

    input {
      width: min(30vw, 360px);
      min-width: 180px;
    }

    button {
      min-width: 36px;
      padding: 0 10px;
      cursor: pointer;
    }

    button:hover,
    input:focus,
    select:focus {
      border-color: var(--focus);
      outline: none;
    }

    label.toggle {
      height: 36px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }

    label.toggle input {
      width: auto;
      min-width: 0;
    }

    main {
      height: calc(100vh - 72px);
      display: grid;
      grid-template-columns: 280px minmax(360px, 1fr) 360px;
      overflow: hidden;
    }

    aside,
    .canvas-shell {
      min-height: 0;
    }

    .model-list,
    .details {
      background: var(--panel);
      border-right: 1px solid var(--line);
      overflow: auto;
    }

    .details {
      border-right: 0;
      border-left: 1px solid var(--line);
    }

    .panel-head {
      position: sticky;
      top: 0;
      z-index: 3;
      background: rgba(255, 255, 255, 0.96);
      border-bottom: 1px solid var(--line);
      padding: 14px;
      backdrop-filter: blur(10px);
    }

    .panel-head h2 {
      margin: 0;
      font-size: 14px;
    }

    .panel-head p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12px;
    }

    .list {
      display: flex;
      flex-direction: column;
      padding: 8px;
      gap: 6px;
    }

    .list button {
      height: auto;
      min-height: 48px;
      display: grid;
      grid-template-columns: 6px 1fr;
      gap: 10px;
      align-items: stretch;
      padding: 0;
      text-align: left;
      overflow: hidden;
    }

    .swatch {
      width: 6px;
      min-height: 100%;
    }

    .list-body {
      padding: 8px 8px 8px 0;
      min-width: 0;
    }

    .model-name {
      display: block;
      font-weight: 700;
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .model-meta {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
      overflow-wrap: anywhere;
    }

    .list button.active {
      border-color: var(--focus);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.14);
    }

    .canvas-shell {
      position: relative;
      background:
        linear-gradient(rgba(148, 163, 184, 0.15) 1px, transparent 1px),
        linear-gradient(90deg, rgba(148, 163, 184, 0.15) 1px, transparent 1px),
        #f8fafc;
      background-size: 28px 28px;
      overflow: hidden;
    }

    .canvas-tools {
      position: absolute;
      z-index: 5;
      top: 12px;
      left: 12px;
      display: flex;
      gap: 6px;
      padding: 6px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }

    .canvas-tools button {
      font-weight: 700;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      cursor: grab;
      user-select: none;
    }

    svg.panning {
      cursor: grabbing;
    }

    .domain-label {
      font-size: 22px;
      font-weight: 800;
      fill: #334155;
      paint-order: stroke;
      stroke: #f8fafc;
      stroke-width: 5px;
    }

    .edge {
      fill: none;
      stroke: #94a3b8;
      stroke-width: 1.6;
      opacity: 0.42;
      marker-end: url(#arrow);
      transition: opacity 120ms ease, stroke-width 120ms ease;
    }

    .edge.active {
      stroke: #0f172a;
      stroke-width: 2.8;
      opacity: 0.95;
    }

    .edge.dimmed {
      opacity: 0.11;
    }

    .node {
      cursor: pointer;
    }

    .node rect.outer {
      fill: #ffffff;
      stroke: #cbd5e1;
      stroke-width: 1;
      filter: drop-shadow(0 7px 16px rgba(15, 23, 42, 0.11));
      transition: stroke 120ms ease, stroke-width 120ms ease, opacity 120ms ease;
    }

    .node .title {
      fill: #0f172a;
      font-size: 15px;
      font-weight: 800;
    }

    .node .domain {
      fill: #64748b;
      font-size: 11px;
      font-weight: 700;
    }

    .node .field {
      fill: #334155;
      font-size: 11px;
    }

    .node .field.meta {
      fill: #64748b;
    }

    .node.hidden {
      display: none;
    }

    .node.dimmed {
      opacity: 0.26;
    }

    .node.selected rect.outer {
      stroke: #0f172a;
      stroke-width: 2;
    }

    .node.matched rect.outer {
      stroke: #2563eb;
      stroke-width: 2;
    }

    .detail-body {
      padding: 14px;
    }

    .detail-body h2 {
      margin: 0;
      font-size: 20px;
      overflow-wrap: anywhere;
    }

    .detail-body h3 {
      margin: 18px 0 8px;
      font-size: 13px;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .domain-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding: 5px 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--muted);
      font-size: 12px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    th,
    td {
      padding: 7px 6px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
    }

    th {
      color: var(--muted);
      font-weight: 700;
    }

    code {
      display: inline-block;
      max-width: 100%;
      padding: 2px 5px;
      border-radius: 6px;
      background: #eef2f7;
      color: #0f172a;
      font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      font-size: 11px;
      overflow-wrap: anywhere;
    }

    .empty {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .relation-list,
    .enum-list,
    .attribute-list {
      display: grid;
      gap: 8px;
    }

    .mini {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.45;
    }

    .mini strong {
      display: block;
      margin-bottom: 3px;
      overflow-wrap: anywhere;
    }

    .mini span {
      color: var(--muted);
    }

    @media (max-width: 1100px) {
      header {
        height: auto;
        align-items: flex-start;
        flex-wrap: wrap;
      }

      .controls {
        width: 100%;
        margin-left: 0;
        flex-wrap: wrap;
      }

      input {
        width: 100%;
      }

      main {
        height: calc(100vh - 128px);
        grid-template-columns: 220px minmax(320px, 1fr);
      }

      .details {
        display: none;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Prisma Schema ERD</h1>
    <div class="stat-row" id="stats"></div>
    <div class="controls">
      <input id="search" type="search" placeholder="Search models or fields">
      <select id="domainFilter" aria-label="Domain filter"></select>
      <label class="toggle"><input id="showEdges" type="checkbox" checked>Relations</label>
      <button id="zoomOut" title="Zoom out">-</button>
      <button id="zoomIn" title="Zoom in">+</button>
      <button id="fit" title="Fit visible graph">Fit</button>
    </div>
  </header>
  <main>
    <aside class="model-list">
      <div class="panel-head">
        <h2>Models</h2>
        <p id="modelCount"></p>
      </div>
      <div class="list" id="modelList"></div>
    </aside>
    <section class="canvas-shell">
      <div class="canvas-tools">
        <button id="reset" title="Reset view">Reset</button>
      </div>
      <svg id="erd" role="img" aria-label="Entity relationship diagram">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"></path>
          </marker>
        </defs>
        <g id="viewport">
          <g id="domainLabels"></g>
          <g id="edges"></g>
          <g id="nodes"></g>
        </g>
      </svg>
    </section>
    <aside class="details">
      <div class="panel-head">
        <h2>Details</h2>
        <p id="detailMeta"></p>
      </div>
      <div class="detail-body" id="details"></div>
    </aside>
  </main>
  <script>
    const ERD_DATA = ${dataJson};
    const SVG_NS = "http://www.w3.org/2000/svg";
    const nodeWidth = 290;
    const nodeHeight = 172;
    const state = {
      selected: ERD_DATA.models.find((model) => model.name === "PersonnelProfile")?.name ?? ERD_DATA.models[0]?.name,
      search: "",
      domain: "All",
      showEdges: true,
      scale: 0.72,
      translate: { x: 70, y: 70 },
      positions: new Map(),
      draggingNode: null,
      panning: null,
      moved: false,
    };

    const svg = document.getElementById("erd");
    const viewport = document.getElementById("viewport");
    const nodesLayer = document.getElementById("nodes");
    const edgesLayer = document.getElementById("edges");
    const labelsLayer = document.getElementById("domainLabels");
    const modelList = document.getElementById("modelList");
    const details = document.getElementById("details");

    initialize();

    function initialize() {
      assignInitialPositions();
      renderStats();
      renderDomainFilter();
      bindControls();
      renderAll();
      requestAnimationFrame(fitVisible);
    }

    function assignInitialPositions() {
      const byDomain = new Map();
      for (const model of ERD_DATA.models) {
        const list = byDomain.get(model.domain) ?? [];
        list.push(model);
        byDomain.set(model.domain, list);
      }

      const orderedDomains = ERD_DATA.domains.map((domain) => domain.name);
      let column = 0;
      for (const domainName of orderedDomains) {
        const group = byDomain.get(domainName) ?? [];
        if (!group.length) continue;
        group.sort((a, b) => a.name.localeCompare(b.name));
        const rowsPerColumn = Math.ceil(Math.sqrt(group.length + 1));
        group.forEach((model, index) => {
          const localColumn = Math.floor(index / rowsPerColumn);
          const row = index % rowsPerColumn;
          state.positions.set(model.name, {
            x: column * 760 + localColumn * 350,
            y: 120 + row * 220,
          });
        });
        column += Math.max(1, Math.ceil(group.length / rowsPerColumn));
      }
    }

    function renderStats() {
      const stats = document.getElementById("stats");
      stats.innerHTML = [
        [ERD_DATA.models.length, "models"],
        [ERD_DATA.relations.length, "relations"],
        [ERD_DATA.enums.length, "enums"],
      ]
        .map(([value, label]) => '<span class="stat"><strong>' + value + '</strong> ' + label + '</span>')
        .join("");
      document.getElementById("detailMeta").textContent =
        ERD_DATA.source + " generated " + new Date(ERD_DATA.generatedAt).toLocaleString();
    }

    function renderDomainFilter() {
      const select = document.getElementById("domainFilter");
      const options = ["All", ...ERD_DATA.domains.map((domain) => domain.name)];
      select.innerHTML = options
        .map((value) => '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</option>')
        .join("");
    }

    function bindControls() {
      document.getElementById("search").addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        renderAll();
      });
      document.getElementById("domainFilter").addEventListener("change", (event) => {
        state.domain = event.target.value;
        renderAll();
        requestAnimationFrame(fitVisible);
      });
      document.getElementById("showEdges").addEventListener("change", (event) => {
        state.showEdges = event.target.checked;
        renderGraph();
      });
      document.getElementById("zoomIn").addEventListener("click", () => zoomBy(1.18));
      document.getElementById("zoomOut").addEventListener("click", () => zoomBy(0.84));
      document.getElementById("fit").addEventListener("click", fitVisible);
      document.getElementById("reset").addEventListener("click", () => {
        state.scale = 0.72;
        state.translate = { x: 70, y: 70 };
        applyTransform();
      });

      svg.addEventListener("wheel", (event) => {
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? 1.08 : 0.92);
      }, { passive: false });

      svg.addEventListener("mousedown", (event) => {
        if (event.target.closest(".node")) return;
        state.panning = {
          x: event.clientX,
          y: event.clientY,
          start: { ...state.translate },
        };
        svg.classList.add("panning");
      });

      window.addEventListener("mousemove", (event) => {
        if (state.draggingNode) {
          const drag = state.draggingNode;
          const dx = (event.clientX - drag.x) / state.scale;
          const dy = (event.clientY - drag.y) / state.scale;
          state.positions.set(drag.name, {
            x: drag.start.x + dx,
            y: drag.start.y + dy,
          });
          state.moved = Math.abs(dx) > 3 || Math.abs(dy) > 3;
          renderGraph();
          return;
        }

        if (!state.panning) return;
        state.translate = {
          x: state.panning.start.x + event.clientX - state.panning.x,
          y: state.panning.start.y + event.clientY - state.panning.y,
        };
        applyTransform();
      });

      window.addEventListener("mouseup", () => {
        state.draggingNode = null;
        state.panning = null;
        svg.classList.remove("panning");
      });
    }

    function renderAll() {
      renderModelList();
      renderGraph();
      renderDetails();
    }

    function renderModelList() {
      const visible = filteredModels();
      document.getElementById("modelCount").textContent = visible.length + " visible";
      modelList.innerHTML = visible
        .map((model) => {
          const relationCount = ERD_DATA.relations.filter((relation) => relation.from === model.name || relation.to === model.name).length;
          return '<button class="' + (state.selected === model.name ? "active" : "") + '" data-model="' + escapeHtml(model.name) + '">' +
            '<span class="swatch" style="background:' + model.color + '"></span>' +
            '<span class="list-body"><span class="model-name">' + escapeHtml(model.name) + '</span>' +
            '<span class="model-meta">' + model.fields.length + ' fields, ' + relationCount + ' relations</span></span>' +
            '</button>';
        })
        .join("");

      modelList.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          state.selected = button.dataset.model;
          renderAll();
          centerModel(state.selected);
        });
      });
    }

    function renderGraph() {
      applyTransform();
      renderDomainLabels();
      renderEdges();
      renderNodes();
    }

    function renderDomainLabels() {
      labelsLayer.textContent = "";
      const visible = filteredModels();
      const byDomain = new Map();
      for (const model of visible) {
        const pos = state.positions.get(model.name);
        if (!pos) continue;
        const current = byDomain.get(model.domain);
        if (!current || pos.x < current.x) {
          byDomain.set(model.domain, { x: pos.x, y: 65 });
        }
      }
      for (const [domain, pos] of byDomain) {
        const text = svgEl("text", {
          x: pos.x,
          y: pos.y,
          class: "domain-label",
        });
        text.textContent = domain;
        labelsLayer.append(text);
      }
    }

    function renderEdges() {
      edgesLayer.textContent = "";
      if (!state.showEdges) return;
      const visibleNames = new Set(filteredModels().map((model) => model.name));
      for (const relation of ERD_DATA.relations) {
        if (!visibleNames.has(relation.from) || !visibleNames.has(relation.to)) continue;
        const from = state.positions.get(relation.from);
        const to = state.positions.get(relation.to);
        if (!from || !to) continue;

        const selected = state.selected && (relation.from === state.selected || relation.to === state.selected);
        const path = svgEl("path", {
          d: edgePath(from, to),
          class: "edge" + (selected ? " active" : state.selected ? " dimmed" : ""),
        });
        const title = svgEl("title");
        title.textContent = relation.from + "." + relation.field + " -> " + relation.to +
          " (" + relation.cardinality + ", FK " + relation.fields.join(", ") + ")";
        path.append(title);
        edgesLayer.append(path);
      }
    }

    function renderNodes() {
      nodesLayer.textContent = "";
      const visibleNames = new Set(filteredModels().map((model) => model.name));
      for (const model of ERD_DATA.models) {
        if (!visibleNames.has(model.name)) continue;
        const pos = state.positions.get(model.name);
        const group = svgEl("g", {
          class: nodeClass(model),
          transform: "translate(" + pos.x + " " + pos.y + ")",
          "data-model": model.name,
          tabindex: "0",
        });

        group.append(svgEl("rect", {
          class: "outer",
          x: 0,
          y: 0,
          width: nodeWidth,
          height: nodeHeight,
          rx: 8,
        }));
        group.append(svgEl("rect", {
          x: 0,
          y: 0,
          width: 8,
          height: nodeHeight,
          rx: 8,
          fill: model.color,
        }));

        const title = svgEl("text", { x: 18, y: 28, class: "title" });
        title.textContent = truncate(model.name, 28);
        group.append(title);

        const domain = svgEl("text", { x: 18, y: 47, class: "domain" });
        domain.textContent = model.domain;
        group.append(domain);

        const previewFields = model.fields.filter((field) => !field.isList).slice(0, 7);
        previewFields.forEach((field, index) => {
          const text = svgEl("text", {
            x: 18,
            y: 74 + index * 14,
            class: "field" + (field.kind === "relation" ? " meta" : ""),
          });
          text.textContent = truncate(fieldLabel(field), 38);
          group.append(text);
        });

        if (model.fields.length > previewFields.length) {
          const more = svgEl("text", {
            x: 18,
            y: 74 + previewFields.length * 14,
            class: "field meta",
          });
          more.textContent = "+" + (model.fields.length - previewFields.length) + " more fields";
          group.append(more);
        }

        group.addEventListener("mousedown", (event) => {
          event.stopPropagation();
          const current = state.positions.get(model.name);
          state.draggingNode = {
            name: model.name,
            x: event.clientX,
            y: event.clientY,
            start: { ...current },
          };
          state.moved = false;
        });
        group.addEventListener("mouseup", (event) => {
          event.stopPropagation();
          if (!state.moved) {
            state.selected = model.name;
            renderAll();
          }
        });
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            state.selected = model.name;
            renderAll();
          }
        });
        nodesLayer.append(group);
      }
    }

    function renderDetails() {
      const model = ERD_DATA.models.find((item) => item.name === state.selected) ?? ERD_DATA.models[0];
      if (!model) {
        details.innerHTML = '<p class="empty">No model selected.</p>';
        return;
      }

      const outgoing = ERD_DATA.relations.filter((relation) => relation.from === model.name);
      const incoming = ERD_DATA.relations.filter((relation) => relation.to === model.name);
      const enumFields = model.fields.filter((field) => field.kind === "enum");

      details.innerHTML =
        '<h2>' + escapeHtml(model.name) + '</h2>' +
        '<span class="domain-pill"><span class="swatch" style="background:' + model.color + '; min-height:14px; border-radius:4px"></span>' + escapeHtml(model.domain) + '</span>' +
        '<h3>Fields</h3>' +
        fieldTable(model.fields) +
        '<h3>Outgoing Relations</h3>' +
        relationList(outgoing, "out") +
        '<h3>Incoming Relations</h3>' +
        relationList(incoming, "in") +
        '<h3>Indexes and Constraints</h3>' +
        attributeList(model.attributes) +
        '<h3>Enums Used</h3>' +
        enumList(enumFields);
    }

    function fieldTable(fields) {
      return '<table><thead><tr><th>Field</th><th>Type</th><th>Flags</th></tr></thead><tbody>' +
        fields.map((field) => {
          const flags = [
            field.isId ? "id" : "",
            field.isUnique ? "unique" : "",
            field.isOptional ? "optional" : "required",
            field.isList ? "list" : "",
            field.defaultValue ? "default " + field.defaultValue : "",
            field.dbType ? "db " + field.dbType : "",
          ].filter(Boolean);
          return '<tr><td><code>' + escapeHtml(field.name) + '</code></td>' +
            '<td><code>' + escapeHtml(field.type) + '</code></td>' +
            '<td>' + flags.map((flag) => '<code>' + escapeHtml(flag) + '</code>').join(" ") + '</td></tr>';
        }).join("") +
        '</tbody></table>';
    }

    function relationList(relations, direction) {
      if (!relations.length) return '<p class="empty">None.</p>';
      return '<div class="relation-list">' + relations.map((relation) => {
        const target = direction === "out" ? relation.to : relation.from;
        const line = direction === "out"
          ? relation.from + "." + relation.field + " -> " + relation.to
          : relation.from + "." + relation.field + " -> " + relation.to;
        return '<div class="mini"><strong>' + escapeHtml(line) + '</strong>' +
          '<span>' + escapeHtml(relation.cardinality + (relation.optional ? ", optional" : ", required")) +
          ' | FK ' + escapeHtml(relation.fields.join(", ")) +
          ' references ' + escapeHtml(target) + '(' + escapeHtml(relation.references.join(", ")) + ')' +
          (relation.relationName ? ' | ' + escapeHtml(relation.relationName) : '') +
          '</span></div>';
      }).join("") + '</div>';
    }

    function attributeList(attributes) {
      if (!attributes.length) return '<p class="empty">None.</p>';
      return '<div class="attribute-list">' +
        attributes.map((attribute) => '<div class="mini"><code>' + escapeHtml(attribute) + '</code></div>').join("") +
        '</div>';
    }

    function enumList(fields) {
      if (!fields.length) return '<p class="empty">None.</p>';
      return '<div class="enum-list">' + fields.map((field) => {
        const enumDef = ERD_DATA.enums.find((item) => item.name === field.baseType);
        return '<div class="mini"><strong>' + escapeHtml(field.name + ": " + field.baseType) + '</strong>' +
          '<span>' + escapeHtml(enumDef?.values.join(", ") ?? "No values found") + '</span></div>';
      }).join("") + '</div>';
    }

    function filteredModels() {
      return ERD_DATA.models.filter((model) => {
        const domainMatch = state.domain === "All" || model.domain === state.domain;
        const queryMatch = !state.search || modelMatches(model, state.search);
        return domainMatch && queryMatch;
      });
    }

    function modelMatches(model, query) {
      return model.name.toLowerCase().includes(query) ||
        model.domain.toLowerCase().includes(query) ||
        model.fields.some((field) =>
          field.name.toLowerCase().includes(query) ||
          field.type.toLowerCase().includes(query) ||
          field.baseType.toLowerCase().includes(query)
        );
    }

    function nodeClass(model) {
      const selected = state.selected === model.name;
      const matched = state.search && modelMatches(model, state.search);
      const connected = !state.selected || ERD_DATA.relations.some((relation) =>
        (relation.from === state.selected && relation.to === model.name) ||
        (relation.to === state.selected && relation.from === model.name)
      );
      return [
        "node",
        selected ? "selected" : "",
        matched ? "matched" : "",
        !selected && state.selected && !connected ? "dimmed" : "",
      ].filter(Boolean).join(" ");
    }

    function fieldLabel(field) {
      const prefix = field.isId ? "# " : field.kind === "relation" ? "> " : "";
      return prefix + field.name + ": " + field.type;
    }

    function edgePath(from, to) {
      if (from.x === to.x && from.y === to.y) {
        const x = from.x + nodeWidth;
        const y = from.y + 44;
        return "M " + x + " " + y + " C " + (x + 80) + " " + (y - 70) + " " + (x + 80) + " " + (y + 70) + " " + x + " " + (y + 100);
      }
      const fromRight = to.x >= from.x;
      const sx = from.x + (fromRight ? nodeWidth : 0);
      const sy = from.y + nodeHeight / 2;
      const tx = to.x + (fromRight ? 0 : nodeWidth);
      const ty = to.y + nodeHeight / 2;
      const curve = Math.max(120, Math.abs(tx - sx) * 0.45);
      const c1x = sx + (fromRight ? curve : -curve);
      const c2x = tx + (fromRight ? -curve : curve);
      return "M " + sx + " " + sy + " C " + c1x + " " + sy + " " + c2x + " " + ty + " " + tx + " " + ty;
    }

    function centerModel(name) {
      const pos = state.positions.get(name);
      if (!pos) return;
      const rect = svg.getBoundingClientRect();
      state.translate = {
        x: rect.width / 2 - (pos.x + nodeWidth / 2) * state.scale,
        y: rect.height / 2 - (pos.y + nodeHeight / 2) * state.scale,
      };
      applyTransform();
    }

    function fitVisible() {
      const visible = filteredModels();
      if (!visible.length) return;
      const positions = visible.map((model) => state.positions.get(model.name)).filter(Boolean);
      const minX = Math.min(...positions.map((pos) => pos.x));
      const minY = Math.min(...positions.map((pos) => pos.y));
      const maxX = Math.max(...positions.map((pos) => pos.x + nodeWidth));
      const maxY = Math.max(...positions.map((pos) => pos.y + nodeHeight));
      const rect = svg.getBoundingClientRect();
      const scaleX = (rect.width - 80) / Math.max(1, maxX - minX);
      const scaleY = (rect.height - 80) / Math.max(1, maxY - minY);
      state.scale = clamp(Math.min(scaleX, scaleY, 1.05), 0.18, 1.2);
      state.translate = {
        x: (rect.width - (maxX - minX) * state.scale) / 2 - minX * state.scale,
        y: (rect.height - (maxY - minY) * state.scale) / 2 - minY * state.scale,
      };
      applyTransform();
    }

    function zoomBy(amount) {
      state.scale = clamp(state.scale * amount, 0.16, 2.2);
      applyTransform();
    }

    function applyTransform() {
      viewport.setAttribute(
        "transform",
        "translate(" + state.translate.x + " " + state.translate.y + ") scale(" + state.scale + ")"
      );
    }

    function svgEl(name, attributes = {}) {
      const element = document.createElementNS(SVG_NS, name);
      for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
      }
      return element;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function truncate(value, maxLength) {
      const text = String(value);
      return text.length > maxLength ? text.slice(0, maxLength - 3) + "..." : text;
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }
  </script>
</body>
</html>
`;
}
