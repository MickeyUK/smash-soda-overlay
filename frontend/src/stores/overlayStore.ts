import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Events } from '@wailsio/runtime';
import axios from 'axios';
import { createConfirmDialog } from 'vuejs-confirm-dialog';
import { Focus, Blur } from '../../bindings/SmashGlass/services/windowservice';
import { LoadPlugins, DeletePlugin } from '@bindings/pluginservice';
import { GetOverlayStyles, GetOverlayThemeCSS } from '@bindings/styleservice';
import { Plugin } from '@bindings/models';
import OverlayTheme from '@/models/OverlayTheme';
import OverlayWidget from '@/models/OverlayWidget';
import ChatWidget from '@/models/widgets/ChatWidget';
import GuestsWidget from '@/models/widgets/GuestsWidget';
import GamepadsWidget from '@/models/widgets/GamepadsWidget';
import WebcamWidget from '@/models/widgets/WebcamWidget';
import RegistryDialog from '@/components/overlay/config/RegistryDialog.vue';

import User from '@/models/User';
import ChatMessage from '@/models/chat/ChatMessage';
import ChatBubble from '@/models/chat/ChatBubble';
import Pad from '@/models/Pad';

import { useSocketStore } from './socketStore';
import { useConfigStore } from './configStore';

export const useOverlayStore = defineStore('overlayStore', () => {

    /**
     * The current user.
     * @type {User}
     */
    const user = ref<User>(new User());

    /**
     * Guests in the room.
     */
    const guests = ref<User[]>([]);

    /**
     * The widgets to be displayed on the overlay.
     */
    const widgets = ref<OverlayWidget[]>([]);

    /**
     * The themes to be displayed on the overlay.
     */
    const themes = ref<OverlayTheme[]>([]);

    /**
     * The custom widgets to be displayed on the overlay.
     */
    const customWidgets = ref<OverlayWidget[]>([]);

    /**
     * The plugins to be loaded on the overlay.
     */
    const plugins = ref<Plugin[]>([]);

    /**
     * The overlay is locked when the menu is open.
     */
    const locked = ref(false);

    /**
     * Whether the overlay is in interactable mode or not,
     * allowing widgets to be moved and resized.
     */
    const interactable = ref(false);

    /**
     * The chat messages to be displayed on the overlay.
     */
    const chatMessages = ref<ChatMessage[]>([]);

    /**
     * The chat bubbles to be displayed on the overlay.
     */
    const chatBubbles = ref<ChatBubble[]>([]);

    /**
     * The next chat message ID.
     */
    let nextChatBubbleId = 0;

    /**
     * The gamepads to be displayed on the overlay.
     */
    const pads = ref<Pad[]>([]);

    /**
     * The user's webcam stream for the webcam widget.
     */
    const webcamStream = ref<MediaStream>(null);

    /**
     * The plugins registry list.
     */
    const pluginsRegistry = ref<any>(null);

    /**
     * The themes registry list.
     */
    const themesRegistry = ref<any>(null);

    /**
     * Initialize the store.
     */
    async function init() {

        await loadThemes();
        await applyTheme(useConfigStore().app.overlay.theme);
        await loadPlugins();
        await handleHotkeys();
        initDefaultWidgets();

        window.$eventBus.on('chat:new', (data: any) => {
            const message = new ChatMessage();
            message.user.id = data.user.id;
            message.user.name = data.user.name;
            message.content = data.message;
            message.createdAt = new Date();
            message.createdAtFormatted = message.formatCreatedAt();
            addChatMessage(message);
        })

        window.$eventBus.on('chat:log', (data: any) => {
            const message = new ChatMessage();
            message.type = 'log';
            message.content = data.message;
            message.createdAt = new Date();
            message.createdAtFormatted = message.formatCreatedAt();
            addChatMessage(message);
        })

        window.$eventBus.on('guest:poll', (data: any) => {
            guests.value = data.users.map(user => new User({
                id: user.id,
                name: user.name,
                latency: user.latency.toFixed(0)
            }));
        })

        window.$eventBus.on('gamepad:poll', (data: any) => {
            pads.value = data.gamepads.map(pad => new Pad({
                buttons: pad.buttons.map(button => ({
                    pressed: button,
                    touched: button,
                    value: button
                })),
                axes: pad.axes,
                owner: pad.owner ? {
                    id: "",
                    name: pad.owner.name
                } : null
            }));
        })
    }

    /**
     * Loads all custom themes for Smash Soda overlay.
     */
    async function loadThemes() {
       
        const loadedThemes = await GetOverlayStyles();

        themes.value = loadedThemes.map(theme => new OverlayTheme({
            id: theme.ID,
            meta: {
                name: theme.Meta?.name || theme.ID,
                author: theme.Meta?.author || 'Unknown',
                description: theme.Meta?.description || ''
            }
        }));

    }

    /**
     * Apply custom style sheet to overlay.
     * @param {string} theme
     */
    async function applyTheme(theme: string) {
        if (theme === 'default') {
            document.getElementById('custom-css').innerHTML = '';
            return;
        }
        try {
            console.log(`Applying theme: ${theme}`);
            const themeCSS = await GetOverlayThemeCSS(theme);
            console.log(themeCSS);
            document.getElementById('custom-css').innerHTML = themeCSS;
        } catch (error) {
            document.getElementById('custom-css').innerHTML = '';
        }
    }

    /**
     * Checks if a theme is loaded.
     * @param {string} theme
     */
    function isThemeLoaded(theme: string) {
        return themes.value.find(t => t.id === theme);
    }

    /**
     * Loads all custom stylesheets for Smash Soda overlay.
     */
    async function loadPlugins() {
        const loadedPlugins = await LoadPlugins();
        const configStore = useConfigStore();
        
        loadedPlugins.forEach(plugin => {

            // Skip plugins already loaded
            if (plugins.value.find(p => p.Meta.id === plugin.Meta.id)) {
                return;
            }

            plugins.value.push(plugin);

            // Create a config if one does not exist
            if (!configStore.app.overlay.widgets.custom[plugin.Meta.name]) {
                configStore.app.overlay.widgets.custom[plugin.Meta.name] = {
                    position: plugin.Config.position,
                    enabled: false,
                    active: false,
                    cfg: plugin.Config
                };
            } else {
                // Add any missing keys to the config
                Object.keys(plugin.Config).forEach(key => {
                    if (configStore.app.overlay.widgets.custom[plugin.Meta.name].cfg[key] === undefined) {
                        configStore.app.overlay.widgets.custom[plugin.Meta.name].cfg[key] = plugin.Config[key];
                    }
                })
            }

            // Create a widget
            const widget = new OverlayWidget({
                id: plugin.Meta.id,
                name: plugin.Meta.name,
                html: plugin.HTML,
                css: plugin.CSS,
                custom: true,
                position: plugin.Config.position,
                enabled: false,
                active: false,
                cfg: plugin.Config
            });
            customWidgets.value.push(widget);

            // Enable the widget if it is enabled in the config
            if (configStore.app.overlay.widgets.custom[plugin.Meta.name].enabled) {
                enableCustomWidget(plugin.Meta.name, true);
            }

            // Evaluate the plugin's JS
            if (plugin.JS) {
                eval(plugin.JS);
            }

            window.$eventBus.emit(`plugin:loaded:${plugin.Meta.id}`, configStore.app.overlay.widgets.custom[plugin.Meta.name].cfg);

        });
    }

    /**
     * Checks if a plugin is loaded.
     * @param {string} pluginName
     */
    function isPluginLoaded(pluginName: string) {
        return plugins.value.find(p => p.Meta.name === pluginName);
    }

    /**
     * Enables a custom widget.
     * 
     * @param widgetName The name of the widget to enable.
     */
    function enableCustomWidget(widgetName: string, state: boolean) {

        // Find the widget
        const widget = customWidgets.value.find(widget => widget.name === widgetName);
        if (widget) {
            widget.enabled = state;

            // Find a style tag with id style-widgetName
            const styleTag = document.getElementById(`style-${widgetName}`);

            if (widget.enabled) {
                if (!styleTag) {
                    // Create a new style tag
                    const styleTag = document.createElement('style');
                    styleTag.id = `style-${widgetName}`;
                    styleTag.innerHTML = widget.css;
                    document.head.appendChild(styleTag);
                }
                window.$eventBus.emit(`plugin:enabled:${widget.id}`);
            } else if (styleTag) {
                styleTag.remove();
                window.$eventBus.emit(`plugin:disabled:${widget.id}`);
            }
        }

    }

    /**
     * Deletes a plugin.
     * 
     * @param pluginId The id of the plugin to delete.
     */
    function deletePlugin(pluginId: string|number) {
        
        window.$dialog.confirm(() => {
            
            // Find the plugin
            const plugin = plugins.value.find(plugin => plugin.Meta.id === pluginId);
            if (plugin) {
                plugins.value.splice(plugins.value.indexOf(plugin), 1);

                // Remove the plugin's widget
                const widget = customWidgets.value.find(widget => widget.name === plugin.Meta.name);
                if (widget) {
                    window.$eventBus.emit(`plugin:unloaded:${plugin.Meta.id}`);

                    // Remove the style tag
                    const styleTag = document.getElementById(`style-${plugin.Meta.name}`);
                    if (styleTag) {
                        styleTag.remove();
                    }

                    customWidgets.value.splice(customWidgets.value.indexOf(widget), 1);
                }

                // Remove the plugin's config
                const config = useConfigStore().app.overlay.widgets.custom[plugin.Meta.name];
                if (config) {
                    delete useConfigStore().app.overlay.widgets.custom[plugin.Meta.name];
                }

                // Delete files
                try {
                    DeletePlugin(plugin.Meta.id);
                } catch (error) {}

            }

        }, 'Are you sure you want to delete this plugin?', 'Delete Plugin');

    }

    /**
     * Gets all themes.
     */
    async function getThemes() {
        if (themesRegistry.value === null) {
            const url = 'https://raw.githubusercontent.com/trybuchet/smash-soda-registry/main/overlay/themes/index.json';
            const response = await axios.get(url, {
                responseType: 'json',
                timeout: 5000,
            });
            themesRegistry.value = response.data;
        }

        const { reveal, onConfirm, onCancel } = createConfirmDialog(RegistryDialog as any, {
            type: 'themes',
            registry: themesRegistry.value,
        });

        reveal();
    }

    /**
     * Gets all plugins.
     */
    async function getPlugins() {
        if (pluginsRegistry.value === null) {
            const url = 'https://raw.githubusercontent.com/trybuchet/smash-soda-registry/main/overlay/plugins/index.json';
            const response = await axios.get(url, {
                responseType: 'json',
                timeout: 5000,
            });
            pluginsRegistry.value = response.data;
        }

        const { reveal, onConfirm, onCancel } = createConfirmDialog(RegistryDialog as any, {
            type: 'plugins',
            registry: pluginsRegistry.value,
        });

        reveal();
    }

    /**
     * Handles the hotkey events.
     */
    async function handleHotkeys() {

        Events.On('hotkey:chat', () => {
            if (locked.value || interactable.value) return;
            // Find chat widget
            const chatWidget = findWidgetByName('chat');
            if (chatWidget) {
                chatWidget.active = !chatWidget.active;

                if (chatWidget.active) {
                    Focus();
                } else {
                    Blur();
                }
            }
        });

        Events.On('hotkey:move', () => {
            if (locked.value) return;
            interactable.value = !interactable.value;

            if (interactable.value) {
                Focus();
            } else {
                Blur();
            }
        });

    }

    /**
     * Find a widget by its name.
     * 
     * @param name The name of the widget to find.
     * @returns The widget, or undefined if not found.
     */
    function findWidgetByName(name: string) {
        const widget = widgets.value.find(widget => widget.name === name);
        if (widget) return widget;
        return customWidgets.value.find(widget => widget.name === name);
    }

    /**
     * Initialize the default widgets.
     * 
     * @returns void
     */
    function initDefaultWidgets() {

        const configStore = useConfigStore();

        try {
            const chatWidget = new ChatWidget();
            Object.assign(chatWidget, {
                enabled: configStore.app.overlay.widgets.default.chat.enabled,
                position: {
                    ...chatWidget.position,
                    ...(configStore.app.overlay.widgets.default.chat.position as any)
                },
                cfg: {
                    ...chatWidget.cfg,
                    ...configStore.app.overlay.widgets.default.chat.cfg
                }
            });

            const guestsWidget = new GuestsWidget();
            Object.assign(guestsWidget, {
                enabled: configStore.app.overlay.widgets.default.guests.enabled,
                position: {
                    ...guestsWidget.position,
                    ...(configStore.app.overlay.widgets.default.guests.position as any)
                },
                cfg: {
                    ...guestsWidget.cfg,
                    ...configStore.app.overlay.widgets.default.guests.cfg
                }
            });

            const gamepadsWidget = new GamepadsWidget();
            Object.assign(gamepadsWidget, {
                enabled: configStore.app.overlay.widgets.default.gamepads.enabled,
                position: {
                    ...gamepadsWidget.position,
                    ...(configStore.app.overlay.widgets.default.gamepads.position as any)
                },
                cfg: {
                    ...gamepadsWidget.cfg,
                    ...configStore.app.overlay.widgets.default.gamepads.cfg
                }
            });

            // const webcamWidget = new WebcamWidget();
            // Object.assign(webcamWidget, {
            //     enabled: configStore.app.overlay.widgets.default.webcam.enabled,
            //     position: {
            //         ...webcamWidget.position,
            //         ...(configStore.app.overlay.widgets.default.webcam.position as any)
            //     },
            //     cfg: {
            //         ...webcamWidget.cfg,
            //         ...configStore.app.overlay.widgets.default.webcam.cfg
            //     }
            // });

            widgets.value = [chatWidget, guestsWidget, gamepadsWidget];

            // Enable webcam?
            // if (configStore.app.overlay.widgets.default.webcam.enabled) {
            //     // Get webcam device
            //     navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: configStore.app.overlay.widgets.default.webcam.cfg.deviceId } } }).then(stream => {
            //         webcamStream.value = stream;
            //     });
            // }
        } catch (error) {
            console.warn('Failed to apply widget config, resetting to defaults.', error);
            configStore.resetConfig();
            widgets.value = [new ChatWidget(), new GuestsWidget(), new GamepadsWidget()];
        }
    }

    /**
     * Add a chat message to the store.
     * 
     * @param message The message to add.
     */
    function addChatMessage(message: ChatMessage) {
        const chatMessage = new ChatMessage(message);

        chatMessages.value.unshift(chatMessage);

        const chatBubble = new ChatBubble(message);
        chatBubble.id = nextChatBubbleId++;
        chatBubbles.value.unshift(chatBubble);
        chatBubble.exitTimeout = setTimeout(() => {
            const bubble = chatBubbles.value.find(b => b.id === chatBubble.id);
            if (!bubble) return;

            bubble.exit = true;

            bubble.deleteTimeout = setTimeout(() => {
                const index = chatBubbles.value.indexOf(bubble);
                if (index !== -1) {
                    chatBubbles.value.splice(index, 1);
                }
            }, 5000);
        }, 10000);
    }

    /**
     * Send a message to the chat.
     * 
     * @param message The message to send.
     */
    function sendMessage(message: string) {
        const socketStore = useSocketStore();
        socketStore.send('chat:send', message);
    }

    return {
        widgets,
        themes,
        customWidgets,
        plugins,
        loadThemes,
        getThemes,
        applyTheme,
        isThemeLoaded,
        loadPlugins,
        getPlugins,
        isPluginLoaded,
        findWidgetByName,
        enableCustomWidget,
        deletePlugin,
        chatMessages,
        chatBubbles,
        addChatMessage,
        sendMessage,
        webcamStream,
        locked,
        user,
        guests,
        pads,
        interactable,
        init
    }

})
