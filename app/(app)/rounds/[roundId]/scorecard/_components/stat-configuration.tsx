"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { normalizeStatName } from "../../../../../_features/stats/contracts";
import type { StatKind } from "../../../../../_features/stats/contracts";
import { configurationOptions, removedAnswers, selectionKey } from "./configuration-draft";
import { StatControlPreview } from "./stat-entry";
import { StatSelector } from "./stat-selector";
import type { StatConfigurationController } from "./use-stat-configuration";

type DialogProps = {
	title: string;
	pending?: boolean;
	onClose: () => void;
	children: ReactNode;
};

function ConfigurationDialog({ title, pending, onClose, children }: DialogProps)
{
	const dialog = useRef<HTMLDialogElement>(null);

	useEffect(() =>
	{
		const element = dialog.current;
		const previous = document.activeElement;
		element?.showModal();

		return () =>
		{
			element?.close();

			if (previous instanceof HTMLElement && previous.isConnected)
			{
				previous.focus({ preventScroll: true });
			}
		};
	}, []);

	return (
		<dialog ref={dialog} className="dialog stat-editor-dialog" aria-label={title}
			onCancel={(event) =>
			{
				event.preventDefault();

				if (!pending)
				{
					onClose();
				}
			}}>
			<h2>{title}</h2>
			{children}
		</dialog>
	);
}

function CreateStatDialog({ controller }: { controller: StatConfigurationController })
{
	const [name, setName] = useState(controller.creation?.name ?? "");
	const [kind, setKind] = useState<StatKind>("number");
	const normalized = normalizeStatName(name);

	return (
		<ConfigurationDialog title="New stat" onClose={controller.cancelCreation}>
			<form onSubmit={(event) =>
			{
				event.preventDefault();

				if (normalized)
				{
					controller.create(normalized, kind);
				}
			}}>
				<label htmlFor="create-stat-name">Name</label>
				<input id="create-stat-name" value={name} maxLength={160} autoFocus
					onChange={(event) => setName(event.target.value)} />
				{Boolean(name) && !normalized && <p className="error-message" role="alert">Use 1–80 characters.</p>}
				<div className="stat-kind-choices" role="group" aria-label="Answer format">
					<button type="button" aria-pressed={kind === "number"} onClick={() => setKind("number")}>
						Number
					</button>
					<button type="button" aria-pressed={kind === "boolean"} onClick={() => setKind("boolean")}>
						Yes / No
					</button>
				</div>
				<button type="submit" className="button button-primary full-width" disabled={!normalized}>Add stat</button>
				<button type="button" className="button button-secondary full-width" onClick={controller.cancelCreation}>
					Cancel
				</button>
			</form>
		</ConfigurationDialog>
	);
}

export function StatConfiguration({ controller, onReload }: {
	controller: StatConfigurationController;
	onReload: () => void;
})
{
	const session = controller.session;

	if (!session)
	{
		return null;
	}

	const options = configurationOptions(session);

	return (
		<section className="inline-stat-configuration" aria-label="Edit stats for this round">
			{controller.message && (
				<div className="workspace-error" role="alert">
					<p>{controller.message}</p>
					{controller.conflict && (
						<button type="button" className="inline-button" onClick={onReload}>Reload and review</button>
					)}
				</div>
			)}
			{session.rows.map((row) =>
			{
				const option = options.find((item) => item.key === selectionKey(row.selection));

				if (!option)
				{
					throw new Error("Configured stat has no selection.");
				}

				return (
					<div key={row.key} className="stat-entry-row stat-configuration-row">
						<div className="stat-label-slot">
							<StatSelector rowKey={row.key} name={option.name} displayName={option.label}
								label={`Choose stat: ${option.label}`}
								controller={controller} />
							<button type="button" className="remove-stat" disabled={controller.pending}
								aria-label={`Remove ${option.label} from this round`} onClick={() => controller.remove(row.key)}>
								<span aria-hidden="true">×</span>
							</button>
						</div>
						<StatControlPreview kind={option.kind} />
					</div>
				);
			})}
			<div className="stat-add-row">
				{controller.activeRow === "add" ? (
					<div className="stat-label-slot">
						<StatSelector rowKey="add" name="" label="Find or create an additional stat" controller={controller} />
						<button type="button" className="remove-stat" aria-label="Cancel adding a stat"
							onClick={controller.cancelSelector}>×</button>
					</div>
				) : (
					<button id="add-round-stat" type="button" className="button button-secondary"
						disabled={controller.pending} onClick={() => controller.search("add", "")}>
						<span aria-hidden="true">+</span> Add stat
					</button>
				)}
			</div>
			{controller.creation && <CreateStatDialog controller={controller} />}
			{controller.confirmation && (
				<ConfigurationDialog
					title={controller.confirmation === "discard" ? "Discard changes?" : "Remove recorded stats?"}
					pending={controller.pending} onClose={controller.closeConfirmation}>
					{controller.confirmation === "discard" ? (
						<p>Your changes to this round&apos;s stat selection and any new stats will not be saved.</p>
					) : (
						<>
							<p>These answers will be permanently removed from this round. Replacement stats start blank.</p>
							<ul>
								{removedAnswers(session).map((stat) => (
									<li key={stat.id}>{stat.name}: {stat.values.length} recorded answers</li>
								))}
							</ul>
						</>
					)}
					<button type="button" className="button button-primary full-width" disabled={controller.pending}
						onClick={controller.confirm}>
						{controller.pending ? "Saving…" : controller.confirmation === "discard" ? "Discard changes" : "Save changes"}
					</button>
					<button type="button" className="button button-secondary full-width" disabled={controller.pending}
						onClick={controller.closeConfirmation}>Keep editing</button>
				</ConfigurationDialog>
			)}
		</section>
	);
}
