-- CreateIndex
CREATE INDEX "trips_organization_id_actual_start_at_idx" ON "trips"("organization_id", "actual_start_at");

-- CreateIndex
CREATE INDEX "trips_organization_id_vehicle_id_actual_start_at_idx" ON "trips"("organization_id", "vehicle_id", "actual_start_at");

-- CreateIndex
CREATE INDEX "trips_organization_id_driver_id_actual_start_at_idx" ON "trips"("organization_id", "driver_id", "actual_start_at");
