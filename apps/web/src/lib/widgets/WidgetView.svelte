<script lang="ts">
	import type { Component } from 'svelte';
	import type { WidgetViewProps } from './types.ts';
	import type { TypeProps } from './props.ts';
	import Fallback from './Fallback.svelte';
	import { validateWidget } from './validate.ts';
	import Markdown from './markdown/Markdown.svelte';
	import Code from './code/Code.svelte';
	import Schema from './schema/Schema.svelte';
	import Migration from './migration/Migration.svelte';
	import Files from './files/Files.svelte';
	import Classes from './classes/Classes.svelte';
	import Options from './options/Options.svelte';
	import Sequence from './sequence/Sequence.svelte';
	import States from './states/States.svelte';
	import Api from './api/Api.svelte';
	import Table from './table/Table.svelte';

	let { widget, lod, marks, selected = null, onselect }: WidgetViewProps = $props();

	const views: Record<string, Component<TypeProps<never>>> = {
		markdown: Markdown,
		code: Code,
		schema: Schema,
		migration: Migration,
		files: Files,
		classes: Classes,
		options: Options,
		sequence: Sequence,
		states: States,
		api: Api,
		table: Table
	} as unknown as Record<string, Component<TypeProps<never>>>;

	const checked = $derived(validateWidget(widget));
	const View = $derived(checked.ok ? views[checked.widget.type] : undefined);
</script>

<div
	class="pw-widget"
	class:pw-preview={lod === 'preview'}
	data-widget={widget.key}
	data-widget-type={widget.type}
>
	{#if !checked.ok}
		<Fallback type={String(widget?.type)} reason={checked.reason} />
	{:else if View}
		<View
			data={checked.widget.data as never}
			widget={checked.widget}
			{lod}
			{marks}
			{selected}
			{onselect}
		/>
	{/if}
</div>

<style>
	.pw-widget {
		min-width: 0;
	}
	.pw-preview {
		width: 300px;
		height: 180px;
		overflow: hidden;
		pointer-events: none;
	}
</style>
