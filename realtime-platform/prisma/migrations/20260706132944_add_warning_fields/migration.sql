-- AlterTable
ALTER TABLE "warning_history" ADD COLUMN     "carNumber" TEXT,
ADD COLUMN     "direction" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "line" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "mileage" TEXT,
ADD COLUMN     "speed" INTEGER,
ADD COLUMN     "station" TEXT,
ADD COLUMN     "value" DOUBLE PRECISION,
ADD COLUMN     "videoUrl" TEXT;
