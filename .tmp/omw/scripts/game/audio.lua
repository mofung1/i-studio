-- ============================================================================
-- 音频：隐藏 Scene + SoundSource 池
--   音频文件缺失时静默降级，绝不阻塞玩法
-- ============================================================================

local Audio = {}

---@type Scene|nil
local scene_ = nil
---@type SoundSource[]
local channels_ = {}
local nextChannel_ = 1
local CHANNEL_COUNT = 6

---@type table<string, Sound|false|nil>
local sounds_ = {}

local PATHS = {
    tap = "Sounds/tap.wav",
    land = "Sounds/land.wav",
    perfect = "Sounds/perfect.wav",
    over = "Sounds/over.wav",
    cut = "Sounds/cut.wav",
}

local function loadSound(key)
    local cached = sounds_[key]
    if cached ~= nil then
        return cached
    end
    local path = PATHS[key]
    if not path then
        sounds_[key] = false
        return false
    end
    local ok, res = pcall(function()
        return cache:GetResource("Sound", path)
    end)
    if ok and res then
        sounds_[key] = res
        return res
    end
    sounds_[key] = false
    return false
end

function Audio.Init()
    pcall(function()
        scene_ = Scene()
        for i = 1, CHANNEL_COUNT do
            local node = scene_:CreateChild("Sfx" .. i)
            local src = node:CreateComponent("SoundSource")
            src.soundType = SOUND_EFFECT
            src.gain = 1.0
            channels_[i] = src
        end
    end)
end

---@param key string
---@param gain number|nil
function Audio.Play(key, gain)
    if #channels_ == 0 then
        return
    end
    local snd = loadSound(key)
    if not snd then
        return
    end
    local src = channels_[nextChannel_]
    nextChannel_ = nextChannel_ % CHANNEL_COUNT + 1
    if not src then
        return
    end
    pcall(function()
        src:Play(snd, 0, gain or 1.0)
    end)
end

function Audio.Shutdown()
    channels_ = {}
    scene_ = nil
end

return Audio
