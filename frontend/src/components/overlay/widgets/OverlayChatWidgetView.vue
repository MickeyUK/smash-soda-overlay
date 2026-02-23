<script lang="ts" setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { useOverlayStore } from '@/stores/overlayStore';
import { Blur } from '../../../../bindings/SmashGlass/services/windowservice';
import OverlayWidgetView from '../OverlayWidgetView.vue';
import ChatWidget from '@/models/widgets/ChatWidget';

const props = defineProps<{ widget: ChatWidget }>();

const overlayStore = useOverlayStore();
const inputRef = ref<HTMLInputElement | null>(null);

let focusTimeout: number | null = null;

function sendMessage() {
    if (inputRef.value) {
        overlayStore.sendMessage(inputRef.value.value);
        inputRef.value.value = '';
    }
}

function onBlur() {
    if (overlayStore.locked) {
        return;
    }
    Blur();
    props.widget.active = false;
}

watch(
    () => props.widget.active,
    async (active) => {
        if (!active) {
            if (focusTimeout !== null) {
                clearTimeout(focusTimeout);
                focusTimeout = null;
            }
            return;
        }

        await nextTick();

        focusTimeout = window.setTimeout(() => {
            if (props.widget.active && inputRef.value) {
                inputRef.value.focus();
            }
            focusTimeout = null;
        }, 100);
    }
);

onBeforeUnmount(() => {
    if (focusTimeout !== null) {
        clearTimeout(focusTimeout);
    }
});
</script>
<template>
    <div class="widget">
        <OverlayWidgetView :widget="widget">
            <div id="widget-chat" class="widget-content" :class="{disabled: overlayStore.interactable}">
                <div v-if="widget.active" class="chat-input-container">
                    <input 
                    ref="inputRef" 
                    class="chat-input" 
                    type="text" 
                    placeholder="Type a message..." 
                    @keyup.enter="sendMessage"
                    @blur="onBlur"
                    />
                </div>

                <div v-if="widget.active && widget.cfg.showHistory" class="message-history panel">
                    <div v-for="message in overlayStore.chatMessages" class="chat-message message">
                        <span v-if="message.type !== 'log'" class="message-guest">{{ message.user.name }}</span>
                        <span class="message-text" :class="{muted: message.type == 'log'}">{{ message.content }}</span>
                        <span class="message-time" v-if="widget.cfg.showTimestamps">{{ message.createdAtFormatted }}</span>
                    </div>
                </div>

                <div v-if="!widget.active" class="chat-bubbles">
                    <div v-for="message in overlayStore.chatBubbles" class="chat-bubble message-bubble panel" :class="{enter: !message.exit, leave: message.exit}">
                        <span v-if="message.type !== 'log'" class="message-guest">{{ message.user.name }}</span>
                        <span class="message-text" :class="{muted: message.type == 'log'}">{{ message.content }}</span>
                        <span class="message-time" v-if="widget.cfg.showTimestamps">{{ message.createdAtFormatted }}</span>
                    </div>
                </div>
            </div>
        </OverlayWidgetView>
    </div>
</template>
<style scoped lang="scss">
.widget-content {
    width: 100%;
    display: block !important;

    &.disabled {
        pointer-events: none;
    }
}

.chat-input-container {
    margin-bottom: 1rem;
    input {
        width: 100%;
    }
}

.message-history {
    overflow-y: scroll;
    height: 150px !important;
    padding: 10px;
    display: block;
    margin-bottom: 1rem;
}

.message-bubble {
    padding: 5px 16px;
    margin-bottom: .5rem;
}

.chat-bubbles .chat-bubble {
    display: flex;
    align-items: baseline;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
}

.chat-bubbles .message-guest {
    flex-shrink: 0;
    max-width: 35%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.chat-bubbles .message-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.chat-bubbles .message-time {
    flex-shrink: 0;
}

.message-guest {
    margin-right: 10px;
}

.message-text {
    margin-right: 10px;
}
</style>
