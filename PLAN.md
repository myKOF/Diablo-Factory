# Implementation Plan: Visualizing Resource Completion

## 🎯 Goal
Ensure all resources defined in `config/resources_data.csv` have high-quality, parameter-driven visual representations in the game engine.

## 🛠 Tasks

### Phase 1: Infrastructure & Documentation
- [x] Create `PLAN.md` (this file) and `progress.md`.
- [x] Verify mapping between `resources_data.csv` and `ResourceRenderer.js`.

### Phase 2: Missing Resource Textures
- [x] Add `CrystalOre` texture (Glowing poly-crystals).
- [x] Add `CopperOre` texture (Reddish-brown metallic rocks).
- [x] Add `SilverOre` texture (Shiny white/silver metallic rocks).
- [x] Add `MithrilOre` texture (Bright blue glowing metallic chunks).

### Phase 3: Configuration Alignment
- [x] Update `src/ui/ui_config.js` with specific color palettes and variation settings for new resources.
- [x] Ensure `ResourceRenderer.generateAllTextures` calls all new generation methods.

### Phase 4: Verification
- [ ] Run the game server and verify texture generation in logs/browser.
- [x] Check if `MainScene.js` correctly maps CSV `model` names to generated textures.

## 📝 Design Principles
- **Aesthetic**: Premium, dark-fantasy style with vibrant resource highlights.
- **SSOT**: All visual parameters must be in `ui_config.js`.
### Phase 5: Synthesis Pipeline System (加工廠系統)
- [x] Implement `src/systems/SynthesisSystem.js` with recipe parsing and production loop.
- [x] Expand `src/ui/ui_config.js` with `SynthesisUI` parameters.
- [x] Refine recipe parser and extend ConfigManager for production data.
- [x] Integrate with `GameEngine` logic tick.
- [ ] Verify resource production and UI state synchronization.

### Phase 6: Building Classification (Type2 Support)
- [ ] Update `config/buildings.csv` with `type2` column and initial categories.
- [ ] Modify `src/systems/ConfigManager.js` to parse and store `type2`.
- [ ] Verify that building configurations correctly include `type2`.

### Phase 7: Processing Plant Population Control (加工廠人數限制)
- [ ] 調整 `WorkerSystem.js` 以支援 `type2=processing_plant` 的派駐限制。
- [ ] 修改 `handleWorkerCommand` 允許工人即便在工廠滿員時也能出發前往（不中斷指令）。
- [ ] 修改 `updateVillagerMovement` 的 `MOVING_TO_FACTORY` 邏輯，在抵達時檢查是否滿員，若滿則停止於外圍。

