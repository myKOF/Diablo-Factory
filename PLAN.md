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
- **Performance**: Use `RenderTexture` to minimize draw calls.
