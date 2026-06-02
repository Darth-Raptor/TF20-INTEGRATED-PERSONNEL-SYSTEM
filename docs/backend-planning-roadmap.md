# Backend Planning Roadmap

## Summary

Planning is done one area at a time. Each area must be verified by the user
before it becomes implementation material.

## Areas

1. Source of truth and data model: implemented in
   `docs/source-of-truth-data-model.md` and `prisma/schema.prisma`.
2. Identity, roles, and access: implemented in
   `docs/identity-roles-access.md` and `prisma/schema.prisma`.
3. Portal workflows: implemented in `docs/portal-workflows.md` and
   `prisma/schema.prisma`.
4. External connections: implemented in `docs/external-connections.md` and
   `prisma/schema.prisma`.
5. API and frontend contract.
6. Operations, security, and testing.

## Rule For Future Areas

Do not reuse previous-build files or assumptions. For future planning areas,
use chat-verified decisions only unless the user explicitly provides a file or
list for verification. When a catalog, workflow, role, permission, integration,
or operational rule is needed, collect and verify it with the user before
encoding it.
