import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");
const seedPath = path.join(projectRoot, "prisma", "seed.mjs");
const schema = fs.readFileSync(schemaPath, "utf8");
const seed = fs.readFileSync(seedPath, "utf8");

const requiredModels = [
  "Account",
  "AuthIdentity",
  "Session",
  "Role",
  "Permission",
  "PermissionGrant",
  "RoleAssignment",
  "AccountRecoveryRequest",
  "Unit",
  "Rank",
  "Billet",
  "StaffSection",
  "MOS",
  "PersonnelProfile",
  "PersonnelStatusHistory",
  "PersonnelRankHistory",
  "PersonnelUnitAssignment",
  "PersonnelBilletAssignment",
  "PersonnelMOSHistory",
  "StaffAssignment",
  "PersonnelStandingHistory",
  "Application",
  "ApplicationAnswer",
  "ApplicationStatusHistory",
  "ApplicationReviewNote",
  "EventTemplate",
  "Event",
  "EventAttendance",
  "LoaRequest",
  "TrainingCourse",
  "Qualification",
  "CourseQualification",
  "TrainingRecord",
  "PersonnelQualification",
  "PromotionRequest",
  "PromotionRecord",
  "Award",
  "AwardRequest",
  "AwardRecord",
  "DisciplinaryRecord",
  "AdministrativeNote",
  "SupportTicket",
  "SupportTicketComment",
  "Notification",
  "AuditLog",
  "IntegrationLog",
];

const retiredModelNames = [
  "User",
  "UserRole",
  "RolePermission",
  "CalendarEvent",
  "AttendanceRecord",
  "BugReport",
  "DiscordSyncLog",
];

const missingModels = requiredModels.filter((modelName) => !new RegExp(`^model\\s+${modelName}\\s+\\{`, "m").test(schema));
if (missingModels.length) {
  fail(`Missing Area 1 models: ${missingModels.join(", ")}`);
}

const retiredModels = retiredModelNames.filter((modelName) => new RegExp(`^model\\s+${modelName}\\s+\\{`, "m").test(schema));
if (retiredModels.length) {
  fail(`Retired previous-build model names are still present: ${retiredModels.join(", ")}`);
}

const duplicateFields = findDuplicateModelFields(schema);
if (duplicateFields.length) {
  fail(`Duplicate Prisma model fields found: ${duplicateFields.join(", ")}`);
}

if (!/catalog-source\.mjs/.test(seed)) {
  fail("Seed file must read from the authoritative catalog source.");
}

console.log(`Area 1 model inventory check passed for ${requiredModels.length} models.`);

function findDuplicateModelFields(schemaText) {
  const duplicates = [];
  const modelPattern = /^model\s+(\w+)\s+\{([\s\S]*?)^}/gm;
  let match;

  while ((match = modelPattern.exec(schemaText))) {
    const [, modelName, body] = match;
    const seen = new Set();

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("@@") || trimmed.startsWith("//")) continue;

      const [fieldName] = trimmed.split(/\s+/);
      if (!fieldName || fieldName.startsWith("@")) continue;

      if (seen.has(fieldName)) {
        duplicates.push(`${modelName}.${fieldName}`);
        continue;
      }

      seen.add(fieldName);
    }
  }

  return duplicates;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
