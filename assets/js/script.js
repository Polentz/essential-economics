gsap.registerPlugin(ScrollTrigger);

const chapters = gsap.utils.toArray(".chapter");
const lastChapter = chapters[chapters.length - 1];
const brand = document.querySelector(".layout-brand");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Viewport height as a CSS variable (--doc-height), stable on mobile browsers */

const documentHeight = () => {
    document.documentElement.style.setProperty("--doc-height", `${window.innerHeight}px`);
};

documentHeight();
window.addEventListener("resize", documentHeight);

window.addEventListener("load", () => {
    history.scrollRestoration = "manual";
    documentHeight();
    ScrollTrigger.refresh();
});

// Web fonts change text heights: re-measure once they are in
document.fonts.ready.then(() => ScrollTrigger.refresh());

/* Snap: after a natural scroll ends, settle on the next chapter in the scroll direction.
   Chapters taller than the viewport are read freely, until their bottom reaches the bottom of the screen. */

// Buffer around a tall chapter's reading area, as a share of the viewport height:
// overshooting it slightly while reading returns to the tall chapter's edge
const FREE_ZONE_BUFFER = 0.35;
let freeRanges = [];
let freeZoneBuffer = 0;
let snapToChapter = (value) => value;

// Where the page last came to rest = where the current gesture began.
// Tells "overshot while reading" apart from "moving on".
let gestureStart = 0;
ScrollTrigger.addEventListener("scrollEnd", () => (gestureStart = window.scrollY));

const measureChapters = () => {
    const maxScroll = ScrollTrigger.maxScroll(window);
    const firstTop = chapters[0].getBoundingClientRect().top + window.scrollY;

    // The top of the page is a resting point too (on mobile, the logo sits above the chapters)
    const snapPoints = firstTop > 0 ? [0] : [];
    freeRanges = [];
    freeZoneBuffer = window.innerHeight * FREE_ZONE_BUFFER;

    chapters.forEach((chapter) => {
        const top = chapter.getBoundingClientRect().top + window.scrollY;
        const excess = chapter.offsetHeight - window.innerHeight;
        snapPoints.push(top);

        if (excess > 1) {
            snapPoints.push(top + excess);
            freeRanges.push([top, top + excess]);
        }
    });

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
        delay: 0.02, // start snapping right after the scroll ends, so motion doesn't pause and restart
        ease: "power2.inOut",
    },
});

/* Last chapter: the brand column turns black (after a short delay) as it comes in,
   and quickly back to white when leaving upward.
   On mobile the last chapter itself and the header turn black too, with white text and logo. */

const cssColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const brandColorIn = { delay: reduceMotion ? 0 : 0.4, duration: reduceMotion ? 0 : 0.8, ease: "power2.inOut" };
const brandColorOut = { duration: reduceMotion ? 0 : 0.3, ease: "power2.out" };

const mobileQuery = window.matchMedia("(max-width: 768px)");
const header = document.querySelector(".header");
const logoHeader = document.querySelector(".logo-header");
const lastChapterLinks = lastChapter.querySelectorAll("a");
let lastChapterActive = false;

// Each target with its dark and light values (only the brand column changes on desktop)
const lastChapterTheme = (dark) => {
    const black = cssColor("--color-black");
    const white = cssColor("--color-white");
    const themes = [[brand, { backgroundColor: dark ? black : white }]];

    if (mobileQuery.matches) {
        themes.push(
            [lastChapter, { backgroundColor: dark ? black : white, color: dark ? white : black }],
            [lastChapterLinks, { "--link-color": dark ? white : black }],
            [header, { backgroundColor: dark ? black : white }],
            [logoHeader, { fill: dark ? white : black }]
        );
    }
    return themes;
};

const applyLastChapterTheme = (dark) => {
    lastChapterActive = dark;
    const timing = dark ? brandColorIn : brandColorOut;
    // overwrite: "auto" also cancels a pending delayed change if the direction flips quickly
    lastChapterTheme(dark).forEach(([target, colors]) => gsap.to(target, { ...colors, ...timing, overwrite: "auto" }));
};

ScrollTrigger.create({
    trigger: lastChapter,
    start: "top center",
    onEnter: () => applyLastChapterTheme(true),
    onLeaveBack: () => applyLastChapterTheme(false),
});

// Crossing the mobile breakpoint: drop the mobile-only colors, or apply them at once if needed
mobileQuery.addEventListener("change", () => {
    gsap.set([lastChapter, lastChapterLinks, header, logoHeader], {
        clearProps: "backgroundColor,color,fill,--link-color",
    });
    lastChapterTheme(lastChapterActive).forEach(([target, colors]) => gsap.set(target, colors));
});

/* Chapter content fades up as each chapter scrolls into view */

if (!reduceMotion) {
    chapters.forEach((chapter) => {
        gsap.from(chapter.querySelector(".chapter-inner"), {
            autoAlpha: 0,
            y: 40,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
                trigger: chapter,
                start: "top 100%",
                toggleActions: "play none none reverse",
            },
        });
    });
}

/* Logo parallax: each bar drifts by its data-speed (in logo units) as the page scrolls.
   While the last chapter scrolls in, every bar exits through the top, leaving the column empty. */

if (!reduceMotion) {
    // Multiplies every data-speed: higher = bars travel further (faster) for the same scroll
    const PARALLAX_STRENGTH = 2;
    const logoSvg = document.querySelector(".logo-animation svg");
    const logoParts = gsap.utils.toArray(".logo-animation svg [data-speed]");
    const maxSpeed = Math.max(...logoParts.map((part) => Math.abs(parseFloat(part.dataset.speed))));
    let parallax;

    // Distance (in logo units) that moves a bar from its place to just above the column
    const exitDistance = (part) => {
        const svgRect = logoSvg.getBoundingClientRect();
        const scale = svgRect.height / logoSvg.viewBox.baseVal.height;
        if (!scale) return 0; // logo not laid out (hidden or zero-size): nothing to move
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

        // Share of the page scroll spent bringing in the last chapter
        const exitShare = gsap.utils.clamp(0.05, 0.5, lastChapter.offsetHeight / ScrollTrigger.maxScroll(window));
        const exitStart = 1 - exitShare;

        parallax = gsap.timeline({
            scrollTrigger: {
                start: 0,
                end: "max",
                // Follow the scroll exactly: the chapter snap already eases the scroll, and extra
                // scrub smoothing on top of it makes the bars stutter while snapping
                scrub: true,
            },
        });

        logoParts.forEach((part) => {
            const speed = parseFloat(part.dataset.speed);
            // Faster bars leave first; all are gone just before the end of the page
            const delay = exitShare * 0.3 * (1 - Math.abs(speed) / maxSpeed);

            parallax
                .to(part, { y: speed * PARALLAX_STRENGTH, ease: "sine.inOut", duration: exitStart }, 0)
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
