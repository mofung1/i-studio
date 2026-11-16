-- ============================================================================
-- 山门（标题界面）
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("game.config")
local Audio = require("game.audio")

local P = Config.Palette

local Screen = {}
Screen.__index = Screen

---@param nav table
---@param progress table
---@return table
function Screen.Create(nav, progress)
    local self = setmetatable({}, Screen)
    self.nav = nav
    self.progress = progress
    self.root = self:build()
    return self
end

---@return Widget
function Screen:build()
    local best = self.progress.best or 0

    local root = UI.Panel {
        width = "100%",
        height = "100%",
        backgroundColor = P.paper,
        children = {
            -- 立轴底纹：右侧一道淡墨
            UI.Panel {
                position = "absolute",
                top = 0,
                bottom = 0,
                right = 26,
                width = 1,
                backgroundColor = { 120, 110, 90, 26 },
            },
            UI.SafeAreaView {
                width = "100%",
                height = "100%",
                children = {
                    UI.Panel {
                        width = "100%",
                        height = "100%",
                        flexDirection = "column",
                        justifyContent = "center",
                        alignItems = "center",
                        padding = 28,
                        gap = 10,
                        children = {
                            UI.Label {
                                text = "叠",
                                fontSize = 96,
                                fontWeight = "bold",
                                fontColor = P.gold,
                                textAlign = "center",
                            },
                            UI.Label {
                                text = "山",
                                fontSize = 42,
                                fontWeight = "bold",
                                fontColor = P.text,
                                letterSpacing = 10,
                                textAlign = "center",
                                marginTop = -6,
                            },
                            UI.Label {
                                text = "一石一石，看能叠到几重天。",
                                fontSize = 12,
                                fontColor = P.textDim,
                                letterSpacing = 1,
                                textAlign = "center",
                                marginTop = 10,
                                whiteSpace = "normal",
                                maxWidth = 260,
                                lineHeight = 1.8,
                            },
                            UI.Panel {
                                flexDirection = "column",
                                alignItems = "center",
                                gap = 2,
                                marginTop = 18,
                                children = {
                                    UI.Label {
                                        text = "最高",
                                        fontSize = 10,
                                        fontColor = P.textDim,
                                        letterSpacing = 3,
                                    },
                                    UI.Label {
                                        text = tostring(best),
                                        fontSize = 30,
                                        fontWeight = "bold",
                                        fontColor = P.text,
                                    },
                                    UI.Label {
                                        text = "重",
                                        fontSize = 10,
                                        fontColor = P.textDim,
                                        letterSpacing = 3,
                                    },
                                },
                            },
                            UI.Button {
                                text = "起 山",
                                width = 210,
                                height = 54,
                                fontSize = 20,
                                fontWeight = "bold",
                                variant = "danger",
                                borderRadius = 27,
                                marginTop = 22,
                                onClick = function()
                                    Audio.Play("tap", 0.6)
                                    self.nav.Go("play")
                                end,
                            },
                            UI.Label {
                                text = "点一下，石块落下。压得越准，山越稳；压歪了，凸出来的那一截就掉下去。",
                                fontSize = 11,
                                fontColor = { 110, 112, 124, 255 },
                                textAlign = "center",
                                whiteSpace = "normal",
                                maxWidth = 280,
                                lineHeight = 1.8,
                                marginTop = 18,
                            },
                        },
                    },
                },
            },
        },
    }

    return root
end

---@param dt number
function Screen:Update(dt)
end

---@param key integer
function Screen:OnKey(key)
    if key == KEY_SPACE or key == KEY_RETURN then
        self.nav.Go("play")
    end
end

function Screen:Destroy()
end

return Screen
