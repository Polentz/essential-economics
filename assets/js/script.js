gsap.registerPlugin(ScrollTrigger);

const documentHeight = () => {
    const doc = document.documentElement;
    doc.style.setProperty("--doc-height", `${window.innerHeight}px`);
};

documentHeight();

window.addEventListener("load", () => {
    history.scrollRestoration = "manual";
    documentHeight();
    ScrollTrigger.refresh();
});

window.addEventListener("resize", () => {
    documentHeight();
});

/* Chapters: native scroll, the brand column takes each chapter's data-brand-background as it appears */

const chapters = gsap.utils.toArray(".chapter");
const brand = document.querySelector(".layout-brand");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const duration = reduceMotion ? 0 : 0.8;
const colorTween = { duration, ease: "power2.inOut", overwrite: "auto" };

// Colors are written as "var(--color-x)": resolve them to real colors GSAP can tween
const resolveColor = (value) => {
    const variable = value.match(/--[\w-]+/)[0];
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
};

// Optional per-chapter data-brand-background, white otherwise
const defaultBrandBackground = resolveColor("var(--color-white)");
const brandBackground = (chapter) =>
    chapter.dataset.brandBackground ? resolveColor(chapter.dataset.brandBackground) : defaultBrandBackground;

gsap.set(brand, { backgroundColor: brandBackground(chapters[0]) });

/* Long chapters: chapters taller than the viewport scroll until their bottom is visible, then stick. */

const chaptersWrapper = document.querySelector(".chapters");

// Where chapters stick, as set by the CSS `top` (0 on desktop, below the logo on mobile)
let stickyOffset = 0;

// Tall chapters stick by their bottom edge: negative top = visible height - chapter height
const setChapterStickyTops = () => {
    // Clear inline tops first so the CSS value can be read
    chapters.forEach((chapter) => (chapter.style.top = ""));
    stickyOffset = parseFloat(getComputedStyle(chapters[0]).top) || 0;

    const visibleHeight = window.innerHeight - stickyOffset;

    chapters.forEach((chapter) => {
        const excess = chapter.offsetHeight - visibleHeight;
        if (excess > 1) chapter.style.top = `${stickyOffset - excess}px`;
    });
};

setChapterStickyTops();
ScrollTrigger.addEventListener("refreshInit", setChapterStickyTops);

// Web fonts change text heights: re-measure once they are in
document.fonts.ready.then(() => ScrollTrigger.refresh());

/* Snap: after a natural scroll ends, settle on the next chapter in the scroll direction.
   Inside a long chapter scrolling stays free, so it can be read at its own pace. */

// Buffer around a tall chapter's reading area, as a share of the visible height:
// overshooting it slightly while reading returns to the tall chapter's edge
const FREE_ZONE_BUFFER = 0.35;
let freeRanges = [];
let freeZoneBuffer = 0;
let snapToChapter = (value) => value;

// Where the page last came to rest = where the current gesture began.
// Tells "overshot while reading" apart from "moving on".
let gestureStart = 0;
ScrollTrigger.addEventListener("scrollEnd", () => (gestureStart = window.scrollY));

// Chapters are sticky, so their live position is unreliable: stack their heights instead
const measureChapters = () => {
    const visibleHeight = window.innerHeight - stickyOffset;
    let y = chaptersWrapper.getBoundingClientRect().top + window.scrollY - stickyOffset;

    // The top of the page is always a resting point (on mobile it shows the full-screen logo)
    const snapPoints = y > 0 ? [0] : [];
    freeRanges = [];
    freeZoneBuffer = visibleHeight * FREE_ZONE_BUFFER;

    chapters.forEach((chapter) => {
        const excess = chapter.offsetHeight - visibleHeight;
        snapPoints.push(y);

        if (excess > 1) {
            snapPoints.push(y + excess);
            freeRanges.push([y, y + excess]);
        }

        y += chapter.offsetHeight;
    });

    const maxScroll = ScrollTrigger.maxScroll(window);
    snapToChapter = ScrollTrigger.snapDirectional(
        snapPoints.map((point) => gsap.utils.clamp(0, 1, point / maxScroll))
    );
};

ScrollTrigger.create({
    start: 0,
    end: "max",
    onRefresh: measureChapters,
    snap: {
        snapTo: (value, self) => {
            const maxScroll = ScrollTrigger.maxScroll(window);
            const scroll = value * maxScroll;

            for (const [start, end] of freeRanges) {
                // Inside a tall chapter's reading area: let the user scroll freely
                if (scroll >= start && scroll <= end) return value;

                // Overshot slightly while reading: pull back to the edge.
                // Starting from the edge itself means moving on, so the normal snap applies.
                const wasReading = gestureStart > start + 2 && gestureStart < end - 2;
                if (!wasReading) continue;
                if (scroll >= start - freeZoneBuffer && scroll < start) return start / maxScroll;
                if (scroll > end && scroll <= end + freeZoneBuffer) return end / maxScroll;
            }

            return snapToChapter(value, self.direction);
        },
        duration: reduceMotion ? 0 : { min: 0.4, max: 0.9 },
        delay: 0.1,
        ease: "power2.inOut",
    },
});

// Back above the first chapter (on mobile: the full-screen logo), restore the first chapter's color
ScrollTrigger.create({
    trigger: chaptersWrapper,
    start: "top center",
    end: "max",
    onLeaveBack: () => gsap.to(brand, { backgroundColor: brandBackground(chapters[0]), ...colorTween }),
});

chapters.forEach((chapter) => {
    const inner = chapter.querySelector(".chapter-inner");

    ScrollTrigger.create({
        trigger: chapter,
        start: "top center",
        end: "bottom center",
        onToggle: ({ isActive }) => {
            if (isActive) gsap.to(brand, { backgroundColor: brandBackground(chapter), ...colorTween });
        },
    });

    if (!reduceMotion) {
        gsap.from(inner, {
            autoAlpha: 0,
            y: 40,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
                trigger: chapter,
                start: "top 70%",
                toggleActions: "play none none reverse",
            },
        });
    }
});

/* Logo parallax: each bar drifts by its data-speed (in logo units) as the page scrolls.
   While the last section scrolls in, every bar exits through the top, leaving the column empty. */

if (!reduceMotion) {
    // Multiplies every data-speed: higher = bars travel further (faster) for the same scroll
    const PARALLAX_STRENGTH = 2;
    const logoSvg = document.querySelector(".logo");
    const logoParts = gsap.utils.toArray(".logo [data-speed]");
    const lastChapter = chapters[chapters.length - 1];
    const maxSpeed = Math.max(...logoParts.map((part) => Math.abs(parseFloat(part.dataset.speed))));
    let parallax;

    // Distance (in logo units) that moves a bar from its place to just above the column
    const exitDistance = (part) => {
        const svgRect = logoSvg.getBoundingClientRect();
        const scale = svgRect.height / logoSvg.viewBox.baseVal.height;
        if (!scale) return 0; // logo not laid out (hidden or zero-size): nothing to move yet
        const svgTopInColumn = (svgRect.top - brand.getBoundingClientRect().top) / scale;
        const box = part.getBBox();
        return -(svgTopInColumn + box.y + box.height + 20);
    };

    const buildParallax = () => {
        if (parallax) {
            parallax.scrollTrigger.kill();
            parallax.kill();
        }
        gsap.set(logoParts, { y: 0 });

        // Share of the page scroll spent bringing in the last section
        const exitShare = gsap.utils.clamp(0.05, 0.5, lastChapter.offsetHeight / ScrollTrigger.maxScroll(window));
        const exitStart = 1 - exitShare;

        parallax = gsap.timeline({
            scrollTrigger: {
                start: 0,
                end: "max",
                scrub: 0.5, // short smooth catch-up instead of following the scrollbar 1:1
            },
        });

        logoParts.forEach((part) => {
            const speed = parseFloat(part.dataset.speed) * PARALLAX_STRENGTH;
            // Faster bars leave first; all are gone just before the end of the page
            const delay = exitShare * 0.3 * (1 - Math.abs(speed) / maxSpeed);

            parallax
                .to(part, { y: speed, ease: "sine.inOut", duration: exitStart }, 0)
                .to(
                    part,
                    { y: exitDistance(part), ease: "power2.in", duration: exitShare * 0.9 - delay },
                    exitStart + delay
                );
        });

        // Make the timeline span exactly 0 → 1 so its progress maps to the page scroll
        parallax.set({}, {}, 1);
    };

    buildParallax();
    document.fonts.ready.then(buildParallax);

    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(buildParallax, 300);
    });
}

/* Preview: links with data-preview show that image over the brand column while hovered */

gsap.utils.toArray("[data-preview]").forEach((link) => {
    const preview = document.createElement("figure");
    preview.className = "brand-preview";

    const image = document.createElement("img");
    image.src = link.dataset.preview;
    image.alt = "";
    preview.appendChild(image);

    // Optional data-preview-credit shows a caption over the image
    if (link.dataset.previewCredit) {
        const credit = document.createElement("figcaption");
        credit.textContent = link.dataset.previewCredit;
        preview.appendChild(credit);
    }

    brand.appendChild(preview);

    const show = () =>
        gsap.to(preview, { autoAlpha: 1, duration: reduceMotion ? 0 : 0.6, ease: "power2.out", overwrite: "auto" });
    const hide = () =>
        gsap.to(preview, { autoAlpha: 0, duration: reduceMotion ? 0 : 0.4, ease: "power2.inOut", overwrite: "auto" });

    link.addEventListener("mouseenter", show);
    link.addEventListener("mouseleave", hide);
    link.addEventListener("focus", show);
    link.addEventListener("blur", hide);
});
