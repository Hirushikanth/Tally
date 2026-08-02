-- Correct schema drift: schema.prisma declares auth & roles, but the init
-- migration never created them (local DBs were ad-hoc patched via db push).
-- 1. MemberRole enum (OWNER/ADMIN/MEMBER/VIEWER)
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- 2. Member.role column (existing rows default to MEMBER)
ALTER TABLE "Member" ADD COLUMN "role" "MemberRole" NOT NULL DEFAULT 'MEMBER';

-- 3. User.passwordHash (placeholder default for existing rows, then removed so
--    future inserts must supply a real hash)
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT 'migrated-placeholder';
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT;
