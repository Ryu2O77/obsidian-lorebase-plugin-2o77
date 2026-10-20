/** Rating value for a click on star `value`: left half of the star = value - 0.5, right half = value. */
export function starValueFromClick(button: HTMLElement, value: number, event: MouseEvent): number {
    const rect = button.getBoundingClientRect();
    const isLeftHalf = rect.width > 0 && event.clientX - rect.left < rect.width / 2;
    return isLeftHalf ? value - 0.5 : value;
}

/** Paint the 5 star buttons for a rating that may include a half star. */
export function paintStars(root: HTMLElement, rating: number | null): void {
    root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-star').forEach((button) => {
        const value = Number(button.dataset.rating ?? '0');
        button.toggleClass('is-active', rating !== null && value <= rating);
        button.toggleClass('is-half', rating !== null && value - 0.5 === rating);
    });
}

/**
 * Hover preview for a row of star buttons: `onPreview` gets the half-star value under the pointer,
 * `onLeave` is called when the pointer leaves the row so the caller can repaint the real value.
 */
export function bindStarHover(container: HTMLElement, onPreview: (value: number) => void, onLeave: () => void): void {
    container.addEventListener('mousemove', (event) => {
        const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('.lorebase-editmode-star');
        if (!button || !container.contains(button)) return;
        const value = Number(button.dataset.rating ?? '0');
        if (!value) return;
        onPreview(starValueFromClick(button, value, event));
    });
    container.addEventListener('mouseleave', onLeave);
}
