-- ============================================================================
-- 叠山 · 对局界面
--   布局：HUD → 立轴玩法区 → 提示
--   玩法区里只有一个「容器」，向上生长靠改容器的 translateY（每帧一次）
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("game.config")
local Stack = require("game.stack")
local Audio = require("game.audio")

local P = Config.Palette
local H = Config.LayerHeight
local POOL = 20
local CUT_POOL = 3

local Screen = {}
Screen.__index = Screen

---@param nav table
---@param progress table
---@return table
function Screen.Create(nav, progress)
    local self = setmetatable({}, Screen)
    self.nav = nav
    self.progress = progress
    self.game = Stack.New()
    self.game.best = progress.best or 0

    self.pool = {}
    self.cutPool = {}
    self.cutIndex = 0
    self.playH = nil
    self.camY = 0
    self.slabW = -1
    self.slabB = -1
    self.cache = {}

    self.game.onEvent = function(kind, data)
        self:onEvent(kind, data)
    end

    self.root = self:build()
    self:refreshLayers()
    self:refreshHud()
    return self
end

-- ---------------------------------------------------------------------------
-- 构建
-- ---------------------------------------------------------------------------

---@return Widget
function Screen:build()
    self.scoreLabel = UI.Label {
        text = "0",
        fontSize = 46,
        fontWeight = "bold",
        fontColor = P.text,
        textAlign = "center",
        lineHeight = 1.1,
    }
    self.tierLabel = UI.Label {
        text = "一 重",
        fontSize = 10,
        fontColor = P.textDim,
        letterSpacing = 4,
        textAlign = "center",
    }
    self.bestLabel = UI.Label {
        text = "0",
        fontSize = 20,
        fontWeight = "bold",
        fontColor = P.textDim,
    }

    -- 石块池
    local children = {}
    for i = 1, POOL do
        local w = UI.Panel {
            position = "absolute",
            left = 0,
            bottom = 0,
            width = 10,
            height = H,
            visible = false,
            borderRadius = 2,
        }
        self.pool[i] = w
        children[#children + 1] = w
    end

    -- 掉落碎片池
    for i = 1, CUT_POOL do
        local w = UI.Panel {
            position = "absolute",
            left = 0,
            bottom = 0,
            width = 10,
            height = H,
            visible = false,
            opacity = 0,
            borderRadius = 2,
        }
        self.cutPool[i] = w
        children[#children + 1] = w
    end

    -- 正在移动的石块
    self.slab = UI.Panel {
        position = "absolute",
        left = 0,
        bottom = H,
        width = Config.BaseWidth,
        height = H,
        backgroundColor = { 96, 102, 116, 255 },
        borderRadius = 2,
        borderWidth = 1,
        borderColor = { 150, 158, 176, 90 },
    }
    children[#children + 1] = self.slab

    self.container = UI.Panel {
        position = "absolute",
        top = 0,
        left = 0,
        right = 0,
        bottom = 0,
        children = children,
    }

    self.feedback = UI.Label {
        text = "",
        position = "absolute",
        top = "26%",
        left = 0,
        right = 0,
        fontSize = 34,
        fontWeight = "bold",
        fontColor = P.gold,
        textAlign = "center",
        letterSpacing = 4,
        opacity = 0,
        pointerEvents = "none",
    }

    self.flash = UI.Panel {
        position = "absolute",
        top = 0,
        left = 0,
        right = 0,
        bottom = 0,
        backgroundColor = { 226, 190, 110, 255 },
        opacity = 0,
        pointerEvents = "none",
    }

    self.playArea = UI.Panel {
        flexGrow = 1,
        width = Config.StageWidth,
        alignSelf = "center",
        backgroundColor = { 11, 12, 16, 255 },
        borderRadius = 10,
        borderWidth = 1,
        borderColor = { 58, 60, 72, 110 },
        overflow = "hidden",
        children = {
            self.container,
            -- 地平线
            UI.Panel {
                position = "absolute",
                left = 0,
                right = 0,
                bottom = 0,
                height = 1,
                backgroundColor = { 120, 104, 76, 90 },
            },
            self.feedback,
            self.flash,
        },
    }

    self.hintLabel = UI.Label {
        text = "点一下，落一石",
        fontSize = 11,
        fontColor = { 110, 112, 124, 255 },
        letterSpacing = 2,
        textAlign = "center",
    }

    -- 结算浮层
    self.overScore = UI.Label {
        text = "0",
        fontSize = 58,
        fontWeight = "bold",
        fontColor = P.gold,
        textAlign = "center",
    }
    self.overBest = UI.Label {
        text = "",
        fontSize = 12,
        fontColor = P.textDim,
        letterSpacing = 2,
        textAlign = "center",
    }
    self.overOverlay = UI.Panel {
        position = "absolute",
        top = 0,
        left = 0,
        right = 0,
        bottom = 0,
        backgroundColor = { 8, 8, 10, 230 },
        visible = false,
        justifyContent = "center",
        alignItems = "center",
        gap = 8,
        children = {
            UI.Label {
                text = "山 止 于 此",
                fontSize = 15,
                fontColor = P.textDim,
                letterSpacing = 8,
            },
            self.overScore,
            UI.Label {
                text = "重",
                fontSize = 11,
                fontColor = P.textDim,
                letterSpacing = 4,
            },
            self.overBest,
            UI.Button {
                text = "再 叠 一 次",
                width = 200,
                height = 50,
                fontSize = 16,
                fontWeight = "bold",
                variant = "danger",
                borderRadius = 25,
                marginTop = 18,
                onClick = function()
                    Audio.Play("tap", 0.6)
                    self:restart()
                end,
            },
            UI.Button {
                text = "回 山 门",
                width = 200,
                height = 44,
                fontSize = 13,
                variant = "secondary",
                borderRadius = 22,
                onClick = function()
                    self.nav.Go("menu")
                end,
            },
        },
    }

    local root = UI.Panel {
        width = "100%",
        height = "100%",
        backgroundColor = P.paper,
        children = {
            UI.SafeAreaView {
                width = "100%",
                height = "100%",
                children = {
                    UI.Panel {
                        width = "100%",
                        height = "100%",
                        flexDirection = "column",
                        padding = 14,
                        gap = 10,
                        children = {
                            -- HUD
                            UI.Panel {
                                flexDirection = "row",
                                alignItems = "center",
                                height = 66,
                                children = {
                                    UI.Panel {
                                        flexGrow = 1,
                                        flexBasis = 0,
                                        flexDirection = "column",
                                        gap = 1,
                                        children = {
                                            UI.Label {
                                                text = "最高",
                                                fontSize = 10,
                                                fontColor = { 100, 102, 114, 255 },
                                                letterSpacing = 3,
                                            },
                                            self.bestLabel,
                                        },
                                    },
                                    UI.Panel {
                                        flexGrow = 1,
                                        flexBasis = 0,
                                        flexDirection = "column",
                                        alignItems = "center",
                                        children = {
                                            self.scoreLabel,
                                            self.tierLabel,
                                        },
                                    },
                                    UI.Panel {
                                        flexGrow = 1,
                                        flexBasis = 0,
                                        alignItems = "flex-end",
                                        children = {
                                            UI.Label {
                                                text = "重",
                                                fontSize = 12,
                                                fontColor = { 100, 102, 114, 255 },
                                                letterSpacing = 2,
                                            },
                                        },
                                    },
                                },
                            },
                            self.playArea,
                            self.hintLabel,
                        },
                    },
                },
            },
            self.overOverlay,
        },
    }

    return root
end

-- ---------------------------------------------------------------------------
-- 刷新
-- ---------------------------------------------------------------------------

function Screen:refreshHud()
    local g = self.game
    if self.cache.score ~= g.score then
        self.cache.score = g.score
        self.scoreLabel:SetText(tostring(g.score))
    end

    local tier = g:Tier()
    if self.cache.tier ~= tier then
        self.cache.tier = tier
        self.tierLabel:SetText("第 " .. tostring(tier) .. " 重山色")
    end

    if self.cache.best ~= g.best then
        self.cache.best = g.best
        self.bestLabel:SetText(tostring(g.best))
    end
end

function Screen:refreshLayers()
    local total = #self.game.layers
    local startIdx = total - POOL + 1
    if startIdx < 1 then
        startIdx = 1
    end

    for i = 1, POOL do
        local w = self.pool[i]
        local idx = startIdx + i - 1
        local layer = self.game.layers[idx]
        if layer then
            local pal = Config.PaletteFor(layer.tier)
            local col = (idx % 2 == 0) and pal.slab or pal.slabAlt
            w:SetStyle({
                bottom = (idx - 1) * H,
                left = layer.left,
                width = layer.width,
                height = H,
                backgroundColor = { col[1], col[2], col[3], 255 },
                opacity = 1,
            })
            w:Show()
        else
            w:Hide()
        end
    end
end

-- ---------------------------------------------------------------------------
-- 每帧
-- ---------------------------------------------------------------------------

function Screen:updateSlab()
    local g = self.game
    local bottom = #g.layers * H
    if self.slabB ~= bottom or self.slabW ~= g.width then
        self.slabB = bottom
        self.slabW = g.width
        self.slab:SetStyle({ bottom = bottom, width = g.width })
    end
    self.slab:SetStyle({ translateX = g.moveX })
end

function Screen:updateCamera()
    if not self.playH then
        local w, h = self.playArea:GetComputedSize()
        if h and h > 1 then
            self.playH = h
        else
            return
        end
    end
    local slabBottom = #self.game.layers * H
    local camY = slabBottom - self.playH * 0.55
    if camY < 0 then
        camY = 0
    end
    if math.abs(camY - self.camY) > 0.2 then
        self.camY = camY
        self.container:SetStyle({ translateY = camY })
    end
end

---@param dt number
function Screen:Update(dt)
    self.game:Update(dt)
    self:updateSlab()
    self:updateCamera()
    self:refreshHud()

end

-- ---------------------------------------------------------------------------
-- 表现
-- ---------------------------------------------------------------------------

---@param text string
---@param color table
function Screen:showFeedback(text, color)
    self.feedback:SetText(text)
    self.feedback:SetStyle({ fontColor = color })
    self.feedback:StopAnimation()
    self.feedback:SetStyle({ opacity = 1, translateY = 0 })
    self.feedback:Animate({
        keyframes = {
            [0] = { opacity = 0, translateY = 16, scale = 0.9 },
            [0.2] = { opacity = 1, translateY = 0, scale = 1.0 },
            [1] = { opacity = 0, translateY = -40, scale = 1.02 },
        },
        duration = 0.7,
        easing = "easeOut",
        fillMode = "forwards",
    })
end

---@param strength number
function Screen:shake(strength)
    local amp = 9 * strength
    self.playArea:StopAnimation()
    self.playArea:Animate({
        keyframes = {
            [0] = { translateX = 0 },
            [0.3] = { translateX = amp },
            [0.6] = { translateX = -amp * 0.7 },
            [1] = { translateX = 0 },
        },
        duration = 0.26,
        easing = "linear",
        fillMode = "forwards",
    })
end

function Screen:flashGold()
    self.flash:StopAnimation()
    self.flash:SetStyle({ opacity = 0.3 })
    self.flash:Animate({
        keyframes = { [0] = { opacity = 0.3 }, [1] = { opacity = 0 } },
        duration = 0.3,
        easing = "easeOut",
        fillMode = "forwards",
    })
end

---@param cut table|nil
---@param tier integer
function Screen:spawnCut(cut, tier)
    if not cut or cut.width <= 1 then
        return
    end
    self.cutIndex = self.cutIndex % CUT_POOL + 1
    local w = self.cutPool[self.cutIndex]
    local pal = Config.PaletteFor(tier)
    local col = pal.slab
    local spin = (cut.left > Config.StageWidth * 0.5) and 16 or -16

    w:StopAnimation()
    w:SetStyle({
        bottom = math.max(0, (#self.game.layers - 1) * H),
        left = cut.left,
        width = cut.width,
        height = H,
        backgroundColor = { col[1], col[2], col[3], 240 },
        opacity = 1,
        translateY = 0,
        translateX = 0,
        rotate = 0,
    })
    w:Show()
    w:Animate({
        keyframes = {
            [0] = { opacity = 1, translateY = 0, rotate = 0 },
            [1] = { opacity = 0, translateY = 180, rotate = spin },
        },
        duration = 0.85,
        easing = "easeIn",
        fillMode = "forwards",
        onComplete = function()
            w:Hide()
        end,
    })
end

---@param kind string
---@param data table|nil
function Screen:onEvent(kind, data)
    if kind == "start" then
        Audio.Play("tap", 0.7)
        self.hintLabel:SetText("对准了再落")
    elseif kind == "land" then
        Audio.Play("land", 0.8)
        self:spawnCut(data and data.cut, data and data.tier or 1)
        self:shake(0.5)
        self:refreshLayers()
        self:showFeedback("第 " .. tostring(self.game.score) .. " 重", P.text)
    elseif kind == "perfect" then
        Audio.Play("perfect", 0.9)
        self:flashGold()
        self:shake(0.8)
        self:refreshLayers()
        self:showFeedback("稳", P.gold)
    elseif kind == "over" then
        Audio.Play("over", 0.9)
        self:shake(1.0)
        self:refreshLayers()
        self:showOver()
    end
end

function Screen:showOver()
    local g = self.game
    self.progress.best = g.best
    self.overScore:SetText(tostring(g.score))
    self.overBest:SetText("最高 " .. tostring(g.best) .. " 重")
    self.overOverlay:Show()
    self.overOverlay:SetStyle({ opacity = 0 })
    self.overOverlay:Animate({
        keyframes = { [0] = { opacity = 0 }, [1] = { opacity = 1 } },
        duration = 0.35,
        easing = "easeOut",
        fillMode = "forwards",
    })
end

function Screen:restart()
    self.overOverlay:Hide()
    self.game:reset()
    self.game.best = self.progress.best or 0
    self.cache = {}
    self.camY = 0
    self.slabW = -1
    self.slabB = -1
    self.container:SetStyle({ translateY = 0 })
    self.hintLabel:SetText("点一下，落一石")
    self:refreshLayers()
    self:refreshHud()
end

-- ---------------------------------------------------------------------------
-- 输入
-- ---------------------------------------------------------------------------

function Screen:OnPress()
    if self.overOverlay.props.visible then
        return
    end
    self.game:Tap()
end

---@param key integer
function Screen:OnKey(key)
    if key == KEY_SPACE or key == KEY_RETURN then
        self:OnPress()
    elseif key == KEY_R then
        self:restart()
    elseif key == KEY_ESCAPE then
        self.nav.Go("menu")
    end
end

function Screen:Destroy()
end

return Screen
