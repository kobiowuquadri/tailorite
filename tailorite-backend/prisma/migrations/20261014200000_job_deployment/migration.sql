-- Background jobs remember which deployment created them; workers only take their own (or unstamped) jobs.
ALTER TABLE "ExtractionJob" ADD COLUMN "deployment" TEXT;
