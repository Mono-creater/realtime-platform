-- CreateTable
CREATE TABLE "warning_history" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "worker" TEXT,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warning_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "over_limit_snapshot" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "snapshot_time" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "over_limit_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
