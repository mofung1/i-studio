-- ============================================================================
-- 《叠山》入口
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("game.config")
local Audio = require("game.audio")

---@type table|nil
local current_ = nil

local progress_ = {
    best = 0,
}

---@type table
local Navigator = {}

---@param screen table
local function switchTo(screen)
    if current_ and current_.Destroy then
        current_:Destroy()
    end
    current_ = screen
    UI.SetRoot(screen.root, true)
end

---@param name string
function Navigator.Go(name)
    if name == "menu" then
        switchTo(require("ui.menu").Create(Navigator, progress_))
    elseif name == "play" then
        switchTo(require("ui.stack_screen").Create(Navigator, progress_))
    end
end

local function dispatchPress()
    if current_ and current_.OnPress then
        current_:OnPress()
    end
end

function Start()
    graphics.windowTitle = Config.Title

    UI.Init({
        theme = "default-dark",
        scale = UI.Scale.DEFAULT,
        fonts = {
            { family = "sans", weights = { normal = "Fonts/MiSans-Regular.ttf" } },
        },
    })

    Audio.Init()

    SubscribeToEvent("Update", "HandleUpdate")
    SubscribeToEvent("KeyDown", "HandleKeyDown")
    SubscribeToEvent("MouseButtonDown", "HandleMouseDown")
    SubscribeToEvent("TouchBegin", "HandleTouchBegin")

    Navigator.Go("menu")
end

function Stop()
    Audio.Shutdown()
    UI.Shutdown()
end

---@param eventType string
---@param eventData UpdateEventData
function HandleUpdate(eventType, eventData)
    local dt = eventData["TimeStep"]:GetFloat()
    if current_ and current_.Update then
        current_:Update(dt)
    end
end

---@param eventType string
---@param eventData KeyDownEventData
function HandleKeyDown(eventType, eventData)
    local key = eventData["Key"]:GetInt()
    if current_ and current_.OnKey then
        current_:OnKey(key)
    end
end

---@param eventType string
---@param eventData MouseButtonDownEventData
function HandleMouseDown(eventType, eventData)
    local button = eventData["Button"]:GetInt()
    if button == MOUSEB_LEFT then
        dispatchPress()
    end
end

---@param eventType string
---@param eventData TouchBeginEventData
function HandleTouchBegin(eventType, eventData)
    dispatchPress()
end
