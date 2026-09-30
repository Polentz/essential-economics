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

/* Chapters: native scroll, brand column changes color as each chapter appears */

const chapters = gsap.utils.toArray(".chapter");
const brand = document.querySelector(".layout-brand");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const duration = reduceMotion ? 0 : 0.8;

// data-color holds "var(--color-x)": resolve it to a real color GSAP can tween
const chapterColor = (chapter) => {
    const variable = chapter.dataset.color.match(/--[\w-]+/)[0];
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
};

gsap.set(brand, { backgroundColor: chapterColor(chapters[0]) });

/* Snap: after a natural scroll ends, settle on the next chapter in the scroll direction.
   Chapters taller than the viewport scroll freely until their bottom is visible, then stick. */

const chaptersWrapper = document.querySelector(".chapters");
// Buffer around a tall chapter's reading area, as a share of the visible height:
// stopping inside it returns to the tall chapter instead of moving to the next one
const FREE_ZONE_BUFFER = 0.35;
let snapPoints = [];
let freeRanges = [];
let freeZoneBuffer = 0;
let snapToChapter = (value) => value;

// On mobile the sticky brand band covers the top of the viewport
const brandOffset = () => (getComputedStyle(brand).position === "sticky" ? brand.offsetHeight : 0);

// Tall chapters stick by their bottom edge: negative top = visible height - chapter height
const setChapterStickyTops = () => {
    const offset = brandOffset();
    const visibleHeight = window.innerHeight - offset;

    chapters.forEach((chapter) => {
        const excess = chapter.offsetHeight - visibleHeight;
        chapter.style.top = excess > 0 ? `${offset - excess}px` : "";
    });
};

// Chapters are sticky, so their live position is unreliable: stack their heights instead
const measureChapters = () => {
    const visibleHeight = window.innerHeight - brandOffset();
    let y = chaptersWrapper.getBoundingClientRect().top + window.scrollY - brandOffset();

    snapPoints = [];
    freeRanges = [];
    freeZoneBuffer = visibleHeight * FREE_ZONE_BUFFER;

    chapters.forEach((chapter) => {
        const excess = chapter.offsetHeight - visibleHeight;
        snapPoints.push(y);

        if (excess > 0) {
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

setChapterStickyTops();
ScrollTrigger.addEventListener("refreshInit", setChapterStickyTops);

// Web fonts change text heights: re-measure once they're in
document.fonts.ready.then(() => ScrollTrigger.refresh());

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
                // Just outside it: pull back to its edge rather than jumping to the next chapter
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

chapters.forEach((chapter) => {
    const inner = chapter.querySelector(".chapter-inner");

    ScrollTrigger.create({
        trigger: chapter,
        start: "top center",
        end: "bottom center",
        onToggle: ({ isActive }) => {
            if (!isActive) return;

            gsap.to(brand, {
                backgroundColor: chapterColor(chapter),
                duration,
                ease: "power2.inOut",
                overwrite: "auto",
            });
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
