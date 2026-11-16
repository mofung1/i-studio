-- ============================================================================
-- 《叠山》核心逻辑：石块来回移动、落下、判定重叠、切掉悬空部分
-- 只做数值和状态，不碰任何 UI
-- ============================================================================

local Config = require "game.config"

local Stack = {}
Stack.__index = Stack

---@return table
function Stack.New()
    local self = setmetatable({}, Stack)

    self.state = "ready" -- ready | playing | over
    self.score = 0
    self.best = 0

    ---@type table[]
    self.layers = {}

    self.width = Config.BaseWidth
    self.moveX = 0
    self.dir = 1
    self.speed = Config.BaseSpeed
    self.perfectStreak = 0

    self.onEvent = nil

    self:reset()
    return self
end

function Stack:emit(kind, data)
    if self.onEvent then
        self.onEvent(kind, data)
    end
end

function Stack:reset()
    self.state = "ready"
    self.score = 0
    self.perfectStreak = 0
    self.width = Config.BaseWidth
    self.moveX = 0
    self.dir = 1
    self.speed = Config.BaseSpeed
    self.layers = {
        {
            left = (Config.StageWidth - Config.BaseWidth) / 2,
            width = Config.BaseWidth,
            tier = 1,
            perfect = false,
        },
    }
end

---@return table
function Stack:TopLayer()
    return self.layers[#self.layers]
end

---@return integer
function Stack:Level()
    return #self.layers - 1
end

---@return integer
function Stack:Tier()
    return math.floor(self:Level() / Config.PaletteShiftEvery) + 1
end

---@return number 最大可移动距离
function Stack:MaxX()
    local m = Config.StageWidth - self.width
    if m < 0 then
        m = 0
    end
    return m
end

---@param dt number
function Stack:Update(dt)
    if self.state ~= "playing" then
        return
    end
    local maxX = self:MaxX()
    self.moveX = self.moveX + self.dir * self.speed * dt
    if self.moveX >= maxX then
        self.moveX = maxX
        self.dir = -1
    elseif self.moveX <= 0 then
        self.moveX = 0
        self.dir = 1
    end
end

--- 开始 / 落石
function Stack:Tap()
    if self.state == "ready" then
        self.state = "playing"
        self.moveX = 0
        self.dir = 1
        self:emit("start")
        return
    end

    if self.state ~= "playing" then
        return
    end

    local top = self:TopLayer()
    local l1, r1 = self.moveX, self.moveX + self.width
    local l2, r2 = top.left, top.left + top.width

    local overlap = math.min(r1, r2) - math.max(l1, l2)
    local dx = math.abs(self.moveX - top.left)

    -- 完全落空
    if overlap <= 1.5 then
        self.state = "over"
        self:emit("over", { score = self.score, dx = dx })
        return
    end

    local perfect = dx <= Config.PerfectTolerance
    local newLeft = top.left
    local newWidth = top.width

    if perfect then
        self.perfectStreak = self.perfectStreak + 1
        -- 连续稳三次，山体回宽一点（挽回一点容错）
        if self.perfectStreak % 3 == 0 and newWidth < Config.BaseWidth then
            newWidth = math.min(Config.BaseWidth, newWidth + 8)
            newLeft = newLeft - 4
        end
    else
        self.perfectStreak = 0
        newLeft = math.max(l1, l2)
        newWidth = overlap
    end

    -- 被切掉的悬空石块（用于表现）
    local cut = nil
    if not perfect then
        if l1 < l2 then
            cut = { left = l1, width = l2 - l1 }
        elseif r1 > r2 then
            cut = { left = r2, width = r1 - r2 }
        end
    end

    table.insert(self.layers, {
        left = newLeft,
        width = newWidth,
        tier = self:Tier() + (perfect and 1 or 0),
        perfect = perfect,
    })

    self.score = self.score + 1
    if self.score > self.best then
        self.best = self.score
    end

    self.width = newWidth
    self.moveX = 0
    self.dir = 1
    self.speed = math.min(Config.MaxSpeed, Config.BaseSpeed + self.score * Config.SpeedPerLayer)

    self:emit(perfect and "perfect" or "land", {
        cut = cut,
        index = self.score,
        tier = self:Tier(),
    })
end

return Stack
