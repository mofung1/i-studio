-- ============================================================================
-- 《叠山》全局配置
-- ============================================================================

local Config = {}

Config.Title = "叠山"

-- 玩法区逻辑宽度（基准像素），宽屏设备两侧留白，像一幅立轴
Config.StageWidth = 320

-- 每一重的高度
Config.LayerHeight = 26

-- 起始石块宽度 / 最窄宽度
Config.BaseWidth = 220
Config.MinWidth = 24

-- 移动速度（每秒像素）与增长
Config.BaseSpeed = 300
Config.SpeedPerLayer = 16
Config.MaxSpeed = 660

-- 落点偏差小于该值算「稳」
Config.PerfectTolerance = 3.5

-- 每叠几重换一层山色
Config.PaletteShiftEvery = 8

-- 山色：每档一组
Config.Palettes = {
    { slab = { 58, 62, 72 }, slabAlt = { 48, 52, 62 }, accent = { 214, 178, 96 }, bg = { 15, 16, 20 } },
    { slab = { 66, 58, 60 }, slabAlt = { 54, 47, 50 }, accent = { 226, 168, 120 }, bg = { 16, 15, 18 } },
    { slab = { 52, 64, 66 }, slabAlt = { 43, 54, 56 }, accent = { 140, 208, 190 }, bg = { 13, 17, 18 } },
    { slab = { 60, 56, 74 }, slabAlt = { 49, 46, 62 }, accent = { 176, 168, 232 }, bg = { 14, 14, 20 } },
    { slab = { 72, 62, 46 }, slabAlt = { 60, 51, 38 }, accent = { 240, 200, 110 }, bg = { 17, 15, 12 } },
    { slab = { 70, 52, 52 }, slabAlt = { 58, 43, 43 }, accent = { 232, 132, 116 }, bg = { 17, 13, 14 } },
}

Config.Palette = {
    text = { 236, 232, 224, 255 },
    textDim = { 140, 142, 154, 255 },
    gold = { 214, 178, 96, 255 },
    paper = "#0F1014",
}

---@param tier integer
---@return table
function Config.PaletteFor(tier)
    local list = Config.Palettes
    local i = (tier - 1) % #list + 1
    return list[i]
end

return Config
