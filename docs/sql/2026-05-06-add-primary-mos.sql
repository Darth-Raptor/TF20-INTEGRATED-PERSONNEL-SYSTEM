-- Run before deploying code that reads PersonnelProfile.primaryMos.
ALTER TABLE `PersonnelProfile`
  ADD COLUMN `primaryMos` VARCHAR(191) NULL;
