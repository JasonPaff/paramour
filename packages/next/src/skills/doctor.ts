// import type, not an inline `{ type … }` specifier: fully erased at emit,
// so the checks.ts ↔ skills/doctor.ts edge never becomes a runtime cycle.
import type { DoctorCheck } from "../doctor/checks.js";

import { message } from "../cli-io.js";
import { loadPackagedSkill } from "./packaged.js";
import { auditTarget, FILE_STATUS_DETAIL, isOutdated } from "./sync.js";
import { detectTargets } from "./targets.js";

/**
 * Doctor's skills battery. Intent comes from manifest presence — doctor is
 * passive and must not nag a project that never opted into skills — unlike
 * `skills --check`, whose intent is the detection result (it is added to CI
 * deliberately). Findings are warn-level, never fail: stale agent guidance
 * degrades agent output but breaks nothing at build or runtime, and a fail
 * here would flip doctor's exit to 1 in every consumer the day after every
 * paramour release. The CI-fatal surface is `paramour skills --check`.
 */
export function skillsDoctorChecks(projectRoot: string): DoctorCheck[] {
  try {
    const detected = detectTargets(projectRoot);
    if (detected.length === 0) {
      return [
        {
          label: "skills: no agent tooling detected — skipped",
          status: "pass",
        },
      ];
    }
    const packaged = loadPackagedSkill();
    const audits = detected
      .map((target) => auditTarget(target, packaged))
      .filter((audit) => audit.manifest !== undefined);
    if (audits.length === 0) {
      // Pass with an advisory label (check 1's "defaults in effect"
      // precedent): declining skills is a legitimate steady state.
      return [
        {
          label: `skills: not installed (\`paramour skills\` installs agent skills for ${detected
            .map((target) => `${target.rel.split("/")[0] ?? ""}/`)
            .join(", ")})`,
          status: "pass",
        },
      ];
    }
    return audits.map((audit): DoctorCheck => {
      const detail = audit.files
        .map((file) => {
          const note = FILE_STATUS_DETAIL[file.status];
          return note === undefined ? undefined : `${file.relPath}: ${note}`;
        })
        .filter((line): line is string => line !== undefined);
      if (detail.length === 0) {
        return {
          label: `skills: ${audit.target.rel} is up to date`,
          status: "pass",
        };
      }
      const outdated = audit.files.some((file) => isOutdated(file.status));
      return {
        detail,
        label: `skills: ${audit.target.rel} ${outdated ? "is stale" : "has local edits"}`,
        status: "warn",
      };
    });
  } catch (error) {
    return [
      {
        detail: [message(error)],
        label: "skills: could not audit installed skills",
        status: "warn",
      },
    ];
  }
}
