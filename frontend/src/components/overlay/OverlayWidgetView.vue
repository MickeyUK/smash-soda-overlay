<script lang="ts" setup>
import { computed, onMounted, onBeforeUnmount, nextTick, ref, watch } from 'vue';
import { useOverlayStore } from '@/stores/overlayStore';
import { useConfigStore } from '@/stores/configStore';
import OverlayWidget from '@/models/OverlayWidget';

const configStore = useConfigStore();
const overlayStore = useOverlayStore();
const props = defineProps<{ widget: OverlayWidget }>();

const contentRef = ref<HTMLElement | null>(null);
const isLocked = computed(() => props.widget.position.fullWidth || props.widget.position.fullHeight);

let dragging = false;
let resizingDir: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null = null;
let startX = 0, startY = 0, startLeft = 0, startTop = 0, startW = 0, startH = 0;

function getZoomScale() {
    return Math.max(0.5, Number(configStore.app.overlay.zoom) || 1);
}

function getViewportSize() {
    const zoom = getZoomScale();
    return {
        width: window.innerWidth / zoom,
        height: window.innerHeight / zoom,
    };
}

function clampRect(x: number, y: number, w: number, h: number) {
    const viewport = getViewportSize();
    const clampedW = Math.min(Math.max(w, props.widget.position.minWidth || 1), viewport.width);
    const clampedH = Math.min(Math.max(h, props.widget.position.minHeight || 1), viewport.height);
    const maxX = viewport.width - clampedW;
    const maxY = viewport.height - clampedH;

    return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY)),
        w: clampedW,
        h: clampedH,
    };
}

function normalizeToCustom() {
    if (props.widget.position.position === 'custom') return;

    const viewport = getViewportSize();
    const resolved = props.widget.resolvePosition(viewport.width, viewport.height);
    const clamped = clampRect(resolved.x, resolved.y, props.widget.position.w, props.widget.position.h);

    props.widget.moveTo(clamped.x, clamped.y);
    props.widget.position.position = 'custom';
}

function clampWidget() {
    if (props.widget.position.fullWidth || props.widget.position.fullHeight) return;

    const pos = props.widget.position;
    const clamped = clampRect(pos.x, pos.y, pos.w, pos.h);

    props.widget.moveTo(clamped.x, clamped.y);
    props.widget.resize(clamped.w, clamped.h);
}

if (props.widget.position.position === 'custom') {
    clampWidget();
}

const style = computed(() => {
    const pos = props.widget.position;
    const viewport = getViewportSize();
    const { x, y } = props.widget.resolvePosition(viewport.width, viewport.height);

    // Only use autoWidth/autoHeight if position is not 'custom'
    const useAuto = pos.position !== 'custom';

    return {
        left: `${x}px`,
        top: `${y}px`,
        width: pos.fullWidth ? '100%' : (useAuto && pos.autoWidth ? 'auto' : `${pos.w}px`),
        height: pos.fullHeight ? '100%' : (useAuto && pos.autoHeight ? 'auto' : `${pos.h}px`),
        minWidth: pos.minWidth ? `${pos.minWidth}px` : undefined,
        minHeight: pos.minHeight ? `${pos.minHeight}px` : undefined,
    };
});

function startDrag(e: MouseEvent) {
    if (!overlayStore.interactable) return;
    if (isLocked.value) return;

    normalizeToCustom();
    dragging = true;

    document.body.style.cursor = 'grabbing';

    startX = e.clientX;
    startY = e.clientY;
    startLeft = props.widget.position.x;
    startTop = props.widget.position.y;

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stopInteraction);
}

function startResize(
    dir: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
    e: MouseEvent
) {
    if (!overlayStore.interactable) return;
    if (isLocked.value) return;

    normalizeToCustom();
    resizingDir = dir;

    const cursorMap = {
        'top-left': 'nw-resize',
        'top-right': 'ne-resize',
        'bottom-left': 'sw-resize',
        'bottom-right': 'se-resize',
    };

    document.body.style.cursor = cursorMap[dir];

    startX = e.clientX;
    startY = e.clientY;
    startLeft = props.widget.position.x;
    startTop = props.widget.position.y;
    startW = props.widget.position.w;
    startH = props.widget.position.h;

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stopInteraction);
}

function onMove(e: MouseEvent) {
    const zoom = getZoomScale();
    const deltaX = (e.clientX - startX) / zoom;
    const deltaY = (e.clientY - startY) / zoom;

    if (dragging) {
        const next = clampRect(
            startLeft + deltaX,
            startTop + deltaY,
            props.widget.position.w,
            props.widget.position.h
        );

        props.widget.moveTo(next.x, next.y);
    }

    if (resizingDir) {
        let newX = startLeft;
        let newY = startTop;
        let newW = startW;
        let newH = startH;

        const dx = deltaX;
        const dy = deltaY;

        switch (resizingDir) {
            case 'top-left':
                newX += dx;
                newY += dy;
                newW -= dx;
                newH -= dy;
                break;
            case 'top-right':
                newY += dy;
                newW += dx;
                newH -= dy;
                break;
            case 'bottom-left':
                newX += dx;
                newW -= dx;
                newH += dy;
                break;
            case 'bottom-right':
                newW += dx;
                newH += dy;
                break;
        }

        const clamped = clampRect(newX, newY, newW, newH);

        props.widget.moveTo(clamped.x, clamped.y);
        props.widget.resize(clamped.w, clamped.h);
    }
}

function stopInteraction() {
    dragging = false;
    resizingDir = null;

    document.body.style.cursor = '';

    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', stopInteraction);

    // Update config
    if (props.widget.custom && configStore.app.overlay.widgets.custom[props.widget.name]) {
        configStore.app.overlay.widgets.custom[props.widget.name].position = props.widget.position;
    } else if (!props.widget.custom && configStore.app.overlay.widgets.default[props.widget.name]) {
        configStore.app.overlay.widgets.default[props.widget.name].position = props.widget.position;
    }
    configStore.saveConfig();
}

function resizeToContent() {
    if (!contentRef.value) return;

    const pos = props.widget.position;

    // Only auto-resize if position is NOT custom
    if (pos.position === 'custom') return;
    if (pos.fullWidth || pos.fullHeight) return;

    let w = pos.w;
    let h = pos.h;

    if (pos.autoWidth) w = Math.max(pos.minWidth || 1, contentRef.value.scrollWidth);
    if (pos.autoHeight) h = Math.max(pos.minHeight || 1, contentRef.value.scrollHeight);

    const clamped = clampRect(pos.x, pos.y, w, h);
    props.widget.resize(clamped.w, clamped.h);
}

watch(
    () => configStore.app.overlay.zoom,
    () => {
        if (props.widget.position.position === 'custom') {
            clampWidget();
        }
    }
);

onMounted(() => {
    if (props.widget.position.autoWidth || props.widget.position.autoHeight) {
        nextTick(resizeToContent);

        if (contentRef.value) {
            const observer = new MutationObserver(resizeToContent);
            observer.observe(contentRef.value, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        }
    }
});

onBeforeUnmount(() => {
    stopInteraction();
});
</script>

<template>
    <div
        v-if="widget"
        class="widget"
        :class="{ interactable: overlayStore.interactable, customSize: props.widget.position.position === 'custom', locked: isLocked }"
        :style="style"
        @mousedown="startDrag"
    >
        <div class="widget-content" ref="contentRef">
            <slot />
        </div>

        <div class="resize-handle top-left" @mousedown.stop="startResize('top-left', $event)" />
        <div class="resize-handle top-right" @mousedown.stop="startResize('top-right', $event)" />
        <div class="resize-handle bottom-left" @mousedown.stop="startResize('bottom-left', $event)" />
        <div class="resize-handle bottom-right" @mousedown.stop="startResize('bottom-right', $event)" />
    </div>
</template>

<style scoped lang="scss">
.widget {
    position: absolute;
    user-select: none;
    transition: 0.2s transform ease;

    &.interactable {
        border: solid 1px #ffae00;
        cursor: grab;

        &:hover {
            transform: scale(1.02);
        }
    }

    &.customSize {
        overflow: hidden;
    }

    &.locked {
        cursor: default;
    }
}

.widget-content {
    width: 100%;
    height: 100%;
    position: relative;
}

.resize-handle {
    display: none;
    position: absolute;
    width: 12px;
    height: 12px;
    z-index: 10;
    pointer-events: auto;
    background: rgba(255, 255, 255, 0.2);

    .interactable & {
        display: block;
        background: rgba(#ffae00, 0.5);
    }

    .locked & {
        display: none;
    }
}

.resize-handle.top-left { top: 0; left: 0; cursor: nw-resize; }
.resize-handle.top-right { top: 0; right: 0; cursor: ne-resize; }
.resize-handle.bottom-left { bottom: 0; left: 0; cursor: sw-resize; }
.resize-handle.bottom-right { bottom: 0; right: 0; cursor: se-resize; }
</style>
