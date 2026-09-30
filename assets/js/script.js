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

/* Chapters: native scroll, the logo takes each chapter's data-color as it appears */

const chapters = gsap.utils.toArray(".chapter");
const brand = document.querySelector(".layout-brand");
const logo = brand.querySelector(".logo");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const duration = reduceMotion ? 0 : 0.8;

// Colors are written as "var(--color-x)": resolve them to real colors GSAP can tween
const resolveColor = (value) => {
    const variable = value.match(/--[\w-]+/)[0];
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
};

// Optional per-chapter data-background, data-foreground and data-brand-background fall back to these
const defaultColors = {
    background: resolveColor("var(--color-white)"),
    foreground: resolveColor("var(--color-black)"),
    brandBackground: resolveColor("var(--color-white)"),
};

const chapterColors = (chapter) => ({
    logo: resolveColor(chapter.dataset.color),
    background: chapter.dataset.background ? resolveColor(chapter.dataset.background) : defaultColors.background,
    foreground: chapter.dataset.foreground ? resolveColor(chapter.dataset.foreground) : defaultColors.foreground,
    brandBackground: chapter.dataset.brandBackground
        ? resolveColor(chapter.dataset.brandBackground)
        : defaultColors.brandBackground,
    hasBrandBackground: Boolean(chapter.dataset.brandBackground),
});

// Desktop: white column, logo in the chapter color.
// Mobile: the brand band takes the chapter color (or its data-brand-background), logo in white.
const mobileQuery = window.matchMedia("(max-width: 768px)");

const brandStyles = (colors) =>
    mobileQuery.matches
        ? {
              logo: { fill: defaultColors.background },
              brand: { backgroundColor: colors.hasBrandBackground ? colors.brandBackground : colors.logo },
          }
        : {
              logo: { fill: colors.logo },
              brand: { backgroundColor: colors.brandBackground },
          };

let activeColors = chapterColors(chapters[0]);

const applyBrandColors = (colors, tween) => {
    activeColors = colors;
    const styles = brandStyles(colors);
    const apply = tween ? gsap.to : gsap.set;
    apply(logo, { ...styles.logo, ...tween });
    apply(brand, { ...styles.brand, ...tween });
};

applyBrandColors(activeColors);
mobileQuery.addEventListener("change", () => applyBrandColors(activeColors));

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

// Chapters are sticky, so their live position is unreliable: stack their heights instead
const measureChapters = () => {
    const visibleHeight = window.innerHeight - stickyOffset;
    let y = chaptersWrapper.getBoundingClientRect().top + window.scrollY - stickyOffset;

    // The top of the page is always a resting point (on mobile it shows the full-screen logo)
    snapPoints = y > 0 ? [0] : [];
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

// Back above the first chapter (on mobile: the full-screen logo), restore the first chapter's colors
ScrollTrigger.create({
    trigger: chaptersWrapper,
    start: "top center",
    end: "max",
    onLeaveBack: () =>
        applyBrandColors(chapterColors(chapters[0]), { duration, ease: "power2.inOut", overwrite: "auto" }),
});

chapters.forEach((chapter) => {
    const inner = chapter.querySelector(".chapter-inner");
    const colors = chapterColors(chapter);
    const tween = { duration, ease: "power2.inOut", overwrite: "auto" };
    const hasOwnColors = chapter.dataset.background || chapter.dataset.foreground;

    ScrollTrigger.create({
        trigger: chapter,
        start: "top center",
        end: "bottom center",
        onToggle: ({ isActive }) => {
            // Chapters with their own colors switch in when active and back out when left
            if (hasOwnColors) {
                gsap.to(chapter, {
                    backgroundColor: isActive ? colors.background : defaultColors.background,
                    color: isActive ? colors.foreground : defaultColors.foreground,
                    ...tween,
                });
            }

            if (!isActive) return;

            applyBrandColors(colors, tween);
        },
    });

    // // Chapters with their own colors switch in only once fully scrolled into view
    // // (top reaching the top of the visible area, just a hair early so the last chapter still fires)
    // if (hasOwnColors) {
    //     ScrollTrigger.create({
    //         trigger: chapter,
    //         start: () => `top ${stickyOffset + 2}px`,
    //         end: "bottom top",
    //         onToggle: ({ isActive }) => {
    //             gsap.to(chapter, {
    //                 backgroundColor: isActive ? colors.background : defaultColors.background,
    //                 color: isActive ? colors.foreground : defaultColors.foreground,
    //                 ...tween,
    //             });
    //         },
    //     });
    // }

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

    const show = () => {
        const options = { duration: reduceMotion ? 0 : 0.6, ease: "power2.out", overwrite: "auto" };
        gsap.to(preview, { autoAlpha: 1, ...options });
        gsap.fromTo(image, { scale: reduceMotion ? 1 : 1 }, { scale: 1, ...options });
    };
    const hide = () =>
        gsap.to(preview, { autoAlpha: 0, duration: reduceMotion ? 0 : 0.4, ease: "power2.inOut", overwrite: "auto" });

    link.addEventListener("mouseenter", show);
    link.addEventListener("mouseleave", hide);
    link.addEventListener("focus", show);
    link.addEventListener("blur", hide);
});
