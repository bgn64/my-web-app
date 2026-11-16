"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { Course, CourseCatalogPage } from "./golf-types";
import { startRound } from "./golf-actions";

type CoursePickerProps = {
	initialCatalog: CourseCatalogPage;
};

function useCourseCatalog(initialCatalog: CourseCatalogPage)
{
	const [query, setQuery] = useState(initialCatalog.query);
	const [page, setPage] = useState(initialCatalog.page);
	const [retry, setRetry] = useState(0);
	const [catalog, setCatalog] = useState(initialCatalog);
	const [searchError, setSearchError] = useState<{
		query: string;
		page: number;
		message: string;
	} | null>(null);
	const [selected, setSelected] = useState<number | null>(null);
	const isSearching = catalog.query !== query || catalog.page !== page;
	const failedSearch = searchError?.query === query && searchError.page === page ? searchError.message : null;
	const visible = isSearching || failedSearch ? [] : catalog.courses;

	useEffect(() =>
	{
		const controller = new AbortController();
		const timer = setTimeout(async () =>
		{
			const params = new URLSearchParams({
				q: query,
				page: String(page),
			});

			window.history.replaceState(null, "", `/play/courses?${params}`);

			try
			{
				const response = await fetch(`/api/courses?${params}`, {
					signal: controller.signal,
					cache: "no-store",
				});

				if (!response.ok)
				{
					throw new Error(response.status === 401
						? "Your session has expired. Please sign in again."
						: "Could not load courses. Please retry.");
				}

				const result: CourseCatalogPage = await response.json();

				if (!controller.signal.aborted)
				{
					setCatalog(result);
					setSearchError(null);
				}
			}
			catch (error)
			{
				if (controller.signal.aborted)
				{
					return;
				}

				console.error("Course search failed:", error);
				setSearchError({
					query,
					page,
					message: error instanceof Error ? error.message : "Could not load courses. Please retry.",
				});
			}
		}, 250);

		return () =>
		{
			clearTimeout(timer);
			controller.abort();
		};
	}, [query, page, retry]);

	useEffect(() =>
	{
		function restoreSearch()
		{
			const params = new URLSearchParams(window.location.search);
			setQuery((params.get("q") ?? "").slice(0, 200));
			const requestedPage = Number(params.get("page") ?? 1);

			setPage(Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000
				? requestedPage
				: 1);
			setSelected(null);
		}

		window.addEventListener("popstate", restoreSearch);

		return () =>
		{
			window.removeEventListener("popstate", restoreSearch);
		};
	}, []);

	function handleSearchChange(value: string)
	{
		setQuery(value);
		setPage(1);
		setSelected(null);
	}

	function handleRetrySearch()
	{
		setSearchError(null);
		setRetry((value) => value + 1);
	}

	function handleSelectCourse(id: number)
	{
		setSelected(id);
	}

	function handlePageChange(nextPage: number)
	{
		setPage(nextPage);
		setSelected(null);
	}

	return {
		query,
		page,
		catalog,
		isSearching,
		failedSearch,
		visible,
		selected,
		handleSearchChange,
		handleRetrySearch,
		handleSelectCourse,
		handlePageChange,
	};
}

type CourseResultsProps = {
	courses: Course[];
	failedSearch: string | null;
	isSearching: boolean;
	isPending: boolean;
	selected: number | null;
	onRetry: () => void;
	onSelect: (id: number) => void;
};

function CourseResults({
	courses,
	failedSearch,
	isSearching,
	isPending,
	selected,
	onRetry,
	onSelect,
}: CourseResultsProps)
{
	if (failedSearch)
	{
		return (
			<div className="empty-state" role="alert">
				<p>{failedSearch}</p>
				<button className="button button-secondary" onClick={onRetry}>
					Retry search
				</button>
			</div>
		);
	}

	if (isSearching)
	{
		return <p role="status">Searching courses...</p>;
	}

	if (courses.length === 0)
	{
		return (
			<div className="empty-state">
				<p>No courses match this search or page.</p>
			</div>
		);
	}

	return (
		<div className="course-list" aria-label="Select a course">
			{courses.map((course) => (
				<button
					type="button"
					disabled={isPending}
					aria-pressed={selected === course.id}
					className={`course-option ${selected === course.id ? "selected" : ""}`}
					key={course.id}
					onClick={() => onSelect(course.id)}
				>
					<span className="course-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
							<path d="M5 22V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0M2 22h6" />
						</svg>
					</span>
					<span className="course-copy">
						<strong>{course.name}</strong>
						<small>{course.location}</small>
					</span>
					<span className="radio-dot" />
				</button>
			))}
		</div>
	);
}

export function CoursePicker({ initialCatalog }: CoursePickerProps)
{
	const {
		query,
		page,
		catalog,
		isSearching,
		failedSearch,
		visible,
		selected,
		handleSearchChange: changeSearch,
		handleRetrySearch,
		handleSelectCourse: selectCourse,
		handlePageChange,
	} = useCourseCatalog(initialCatalog);
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState("");
	const router = useRouter();

	function handleSearchChange(event: ChangeEvent<HTMLInputElement>)
	{
		changeSearch(event.target.value);
		setError("");
	}

	function handleSelectCourse(id: number)
	{
		selectCourse(id);
		setError("");
	}

	async function handleStart()
	{
		if (selected === null || isPending)
		{
			return;
		}

		setIsPending(true);
		setError("");

		try
		{
			const result = await startRound(String(selected));

			if (!result.ok)
			{
				setError(result.error);
			}
			else if (result.roundId)
			{
				router.push(`/rounds/${result.roundId}/scorecard`);
			}
			else
			{
				setError("The round was created, but its scorecard could not be opened. Check Play.");
			}
		}
		catch (error)
		{
			console.error("Could not start round:", error);
			setError("Could not reach the server. Check Play before trying again.");
		}
		finally
		{
			setIsPending(false);
		}
	}

	let startLabel = "Start round";

	if (isPending)
	{
		startLabel = "Preparing scorecard...";
	}
	else if (error)
	{
		startLabel = "Retry start round";
	}

	return (
		<>
			<label className="search-label" htmlFor="course-search">
				Search courses
			</label>
			<input
				id="course-search"
				className="search-input"
				type="search"
				placeholder="Search by course name or location"
				maxLength={200}
				disabled={isPending}
				value={query}
				onChange={handleSearchChange}
			/>
			<div className="section-heading">
				<span>COURSE CATALOG</span>
				<span>{isSearching ? "SEARCHING..." : `${catalog.total.toLocaleString()} MATCHES`}</span>
			</div>
			<CourseResults
				courses={visible}
				failedSearch={failedSearch}
				isSearching={isSearching}
				isPending={isPending}
				selected={selected}
				onRetry={handleRetrySearch}
				onSelect={handleSelectCourse}
			/>
			{!isSearching && !failedSearch && (
				<div className="catalog-pagination" aria-label="Course result pages">
					<button
						className="button button-secondary"
						disabled={page === 1 || isPending}
						onClick={() => handlePageChange(page - 1)}
					>
						Previous
					</button>
							<span>Page {page} of {Math.max(1, Math.ceil(catalog.total / 50))}</span>
					<button
						className="button button-secondary"
						disabled={page * 50 >= catalog.total || isPending}
						onClick={() => handlePageChange(page + 1)}
					>
						Next
					</button>
				</div>
			)}
			{error && (
				<p className="error-message" role="alert">
					{error}
				</p>
			)}
			<button
				className="button button-primary full-width start-button"
				disabled={selected === null || isPending || isSearching || !!failedSearch}
				onClick={handleStart}
			>
				{startLabel}{" "}
				<span aria-hidden="true">→</span>
			</button>
			<p className="helper-text">You can score any hole, in any order.</p>
			<p className="catalog-credit">
				Contains data from{" "}
				<a href="https://opengolfapi.org" target="_blank" rel="noreferrer">
					OpenGolfAPI
				</a>{" "}
				and{" "}
				<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
					OpenStreetMap contributors
				</a>.{" "}
				<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">
					ODbL 1.0
				</a>. Course details are checked when you start a round.
			</p>
		</>
	);
}
