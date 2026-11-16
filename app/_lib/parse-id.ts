export function parseId(value: string): number | null
{
	if (!/^[1-9]\d*$/.test(value))
	{
		return null;
	}

	const id = Number(value);
	return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
