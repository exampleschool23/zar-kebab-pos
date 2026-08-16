export function getMenuCategoryScrollTarget({
  sectionTop,
  rootTop,
  scrollTop,
  scrollOffset,
  stickyBarOffset,
}) {
  return Math.max(
    0,
    sectionTop - rootTop + scrollTop - scrollOffset + stickyBarOffset
  )
}
