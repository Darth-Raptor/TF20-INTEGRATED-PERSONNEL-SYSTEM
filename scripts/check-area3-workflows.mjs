import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const schema = fs.readFileSync(path.join(projectRoot, "prisma", "schema.prisma"), "utf8");
const seed = fs.readFileSync(path.join(projectRoot, "prisma", "seed.mjs"), "utf8");
const docPath = path.join(projectRoot, "docs", "portal-workflows.md");

if (!fs.existsSync(docPath)) {
  fail("Missing Area 3 workflow planning document.");
}

const requiredEnumValues = {
  ApplicationStatus: [
    "Submitted",
    "RecruiterScreening",
    "RecruiterRecommended",
    "TargetUnitReview",
    "Accepted",
    "Denied",
    "Withdrawn",
    "Closed",
    "Converted",
  ],
  ApplicationReviewStage: ["RecruiterScreening", "TargetUnitReview", "FinalDecision"],
  EventStatus: ["RosterFinalized"],
  EventRosterSource: ["Template", "UnitRoster", "ManualAdjustment"],
  LoaApprovalLevel: ["UnitStaff", "Escalated"],
  NotificationDeliveryChannel: ["InApp"],
};

const retiredApplicationStatuses = [
  "Contacted",
  "InterviewScheduled",
  "InterviewCompleted",
];

const requiredFields = {
  Application: [
    "targetUnitId",
    "targetUnit",
    "recruiterRecommendedByAccountId",
    "recruiterRecommendedAt",
    "unitDecisionByAccountId",
    "unitDecisionAt",
    "closedAt",
  ],
  ApplicationStatusHistory: ["stage", "permissionContext", "reason", "auditLogId"],
  ApplicationReviewNote: ["stage"],
  LoaRequest: [
    "approvalLevel",
    "submittedByAccountId",
    "escalatedAt",
    "escalationReason",
    "cancelledAt",
    "withdrawnAt",
    "earlyReturnAt",
  ],
  Event: [
    "rosterSource",
    "sourceUnitId",
    "ownerAccountId",
    "rosterFinalizedAt",
    "attendanceFinalizedAt",
  ],
  EventAttendance: ["expectedSource", "correctedByAccountId", "correctedAt", "correctionReason"],
  TrainingRecord: ["recordedByAccountId"],
  PersonnelQualification: ["changedByAccountId"],
  SupportTicket: ["queueKey", "intakeOnly", "resolvedAt", "closedAt", "voidedAt"],
  Notification: ["deliveryChannel", "workflowEvent"],
  Unit: ["targetedApplications"],
};

for (const [enumName, values] of Object.entries(requiredEnumValues)) {
  const body = enumBody(enumName);
  for (const value of values) {
    assertPattern(new RegExp(`^\\s*${value}\\s*$`, "m"), `Missing Area 3 enum value ${enumName}.${value}`, body);
  }
}

const applicationStatusBody = enumBody("ApplicationStatus");
for (const status of retiredApplicationStatuses) {
  if (new RegExp(`^\\s*${status}\\s*$`, "m").test(applicationStatusBody)) {
    fail(`ApplicationStatus still contains non-Area-3 status ${status}`);
  }
}

for (const [modelName, fields] of Object.entries(requiredFields)) {
  const body = modelBody(modelName);
  for (const field of fields) {
    assertPattern(new RegExp(`^\\s*${field}\\s+`, "m"), `Missing Area 3 field ${modelName}.${field}`, body);
  }
}

const trainingRecordBody = modelBody("TrainingRecord");
assertPattern(/^\s*status\s+RequestStatus\s+@default\(Completed\)/m, "TrainingRecord must default to completed official records.", trainingRecordBody);

if (/\b(role|permission|unit|rank|billet|staffSection|specialty)\.(create|upsert|createMany)\b/i.test(seed)) {
  fail("Seed file must not create official catalogs while Area 3 workflow planning is unverified by catalog.");
}

console.log("Area 3 portal workflow check passed.");

function enumBody(enumName) {
  const match = new RegExp(`^enum\\s+${enumName}\\s+\\{([\\s\\S]*?)^}`, "m").exec(schema);
  if (!match) fail(`Missing enum ${enumName}`);
  return match[1];
}

function modelBody(modelName) {
  const match = new RegExp(`^model\\s+${modelName}\\s+\\{([\\s\\S]*?)^}`, "m").exec(schema);
  if (!match) fail(`Missing model ${modelName}`);
  return match[1];
}

function assertPattern(pattern, message, text = schema) {
  if (!pattern.test(text)) fail(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
