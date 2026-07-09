export function personNameSortParts(fullName, fallback = "") {
  const normalizedFallback = String(fallback ?? "").toLowerCase();
  const tokens = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!tokens.length) {
    return {
      last: normalizedFallback,
      first: normalizedFallback,
      full: normalizedFallback,
    };
  }

  return {
    last: tokens.at(-1)?.toLowerCase() ?? "",
    first: tokens[0]?.toLowerCase() ?? "",
    full: tokens.join(" ").toLowerCase(),
  };
}

export function comparePersonNamesByLastName(leftName, rightName) {
  const left = personNameSortParts(leftName);
  const right = personNameSortParts(rightName);
  return (
    left.last.localeCompare(right.last) ||
    left.first.localeCompare(right.first) ||
    left.full.localeCompare(right.full)
  );
}
