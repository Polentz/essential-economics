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

/* Logo parallax: each bar drifts by its data-speed (in logo units) as the page scrolls.
   While the last section scrolls in, every bar exits through the top, leaving the column empty. */

if (!reduceMotion) {
    const logoSvg = document.querySelector(".logo");
    const logoParts = gsap.utils.toArray(".logo [data-speed]");
    const lastChapter = chapters[chapters.length - 1];
    const maxSpeed = Math.max(...logoParts.map((part) => Math.abs(parseFloat(part.dataset.speed))));
    let parallax;

    // Distance (in logo units) that moves a bar from its place to just above the column
    const exitDistance = (part) => {
        const svgRect = logoSvg.getBoundingClientRect();
        const scale = svgRect.height / logoSvg.viewBox.baseVal.height;
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
                scrub: 1, // smooth catch-up instead of following the scrollbar 1:1
            },
        });

        logoParts.forEach((part) => {
            const speed = parseFloat(part.dataset.speed);
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
