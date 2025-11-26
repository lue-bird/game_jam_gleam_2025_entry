import gleam/float
import gleam/int
import gleam/list
import gleam/result
import gleam/string
import gleam_community/colour
import gleam_community/maths
import lustre
import lustre/attribute
import lustre/effect
import lustre/element as lustre_element
import lustre/element/html
import lustre/element/svg
import plinth/browser/document
import plinth/browser/element
import plinth/browser/window
import plinth/javascript/global

pub fn main() {
  let app = lustre.application(fn(_: Nil) { init() }, update, view)
  // I couldn't get "using custom index.html with lustre/dev start" to work
  element.set_attribute(
    document.body(),
    "style",
    "margin: 0; background: black",
  )
  let assert Ok(_) = lustre.start(app, "#app", Nil)
  Nil
}

type State {
  State(window_width: Float, window_height: Float, lucy_angle: Float)
}

fn init() -> #(State, effect.Effect(Msg)) {
  #(
    State(
      window_height: window.inner_height(window.self()) |> int.to_float,
      window_width: window.inner_width(window.self()) |> int.to_float,
      lucy_angle: 0.0,
    ),
    effect.batch([
      effect.from(fn(dispatch) {
        window.add_event_listener("resize", fn(_event) { dispatch(Resized) })
      }),
      effect.from(fn(dispatch) {
        let _ =
          global.set_interval(1000 / 60, fn() { dispatch(SimulationTickPassed) })
        Nil
      }),
    ]),
  )
}

type Msg {
  Resized
  SimulationTickPassed
}

fn update(state: State, msg: Msg) -> #(State, effect.Effect(Msg)) {
  case msg {
    Resized -> #(
      State(
        ..state,
        window_height: window.inner_height(window.self()) |> int.to_float,
        window_width: window.inner_width(window.self()) |> int.to_float,
      ),
      effect.none(),
    )
    SimulationTickPassed -> #(
      State(..state, lucy_angle: state.lucy_angle +. 0.02),
      effect.none(),
    )
  }
}

fn view(state: State) -> lustre_element.Element(Msg) {
  let ration_width_to_height: Float = 16.0 /. 9.0
  let #(svg_width, svg_height) = case
    state.window_width <. state.window_height *. ration_width_to_height
  {
    True ->
      // disproportional in height
      #(state.window_width, state.window_width /. ration_width_to_height)

    False ->
      // might be disproportional in width
      #(state.window_height *. ration_width_to_height, state.window_height)
  }
  html.div([attribute.style("background", "black")], [
    svg.svg(
      [
        attribute.style("position", "absolute"),
        attribute.style(
          "right",
          { { state.window_width -. svg_width } /. 2.0 } |> float.to_string
            <> "px",
        ),
        attribute.style(
          "bottom",
          { { state.window_height -. svg_height } /. 2.0 } |> float.to_string
            <> "px",
        ),
        attribute.width(svg_width |> float.truncate),
        attribute.height(svg_height |> float.truncate),
      ],
      [
        svg.g(
          [
            attribute.attribute(
              "transform",
              "scale("
                <> { svg_width /. 16.0 |> float.to_string }
                <> ", "
                <> { svg_height /. 9.0 |> float.to_string }
                <> ")",
            ),
          ],
          [
            svg.rect([
              attribute.attribute("x", "0"),
              attribute.attribute("y", "0"),
              attribute.attribute("width", "100%"),
              attribute.attribute("height", "100%"),
              attribute.attribute(
                "fill",
                colour.from_rgb(0.0, 0.3, 0.46)
                  |> result.unwrap(colour.black)
                  |> colour.to_css_rgba_string,
              ),
            ]),
            svg_lucy()
              |> svg_rotate(state.lucy_angle)
              |> svg_translate(11.86, 3.9),
            svg_lucy()
              |> svg_rotate(state.lucy_angle)
              |> svg_translate(4.5, 4.3),
            svg.text(
              [
                attribute.attribute("x", "2"),
                attribute.attribute("y", "6"),
                attribute.attribute("pointer-events", "none"),
                attribute.style("font-weight", "bold"),
                attribute.style("font-size", "3px"),
                attribute.style(
                  "fill",
                  colour.from_rgb(0.9, 1.0, 0.86)
                    |> result.unwrap(colour.black)
                    |> colour.to_css_rgba_string,
                ),
              ],
              "hi, cutie",
            ),
          ],
        ),
      ],
    ),
  ])
}

fn svg_lucy() -> lustre_element.Element(msg) {
  svg.path([
    attribute.attribute("stroke-width", "0.23"),
    attribute.attribute("stroke-linejoin", "round"),
    attribute.attribute(
      "stroke",
      lucy_color()
        |> colour.to_css_rgba_string,
    ),
    attribute.attribute(
      "fill",
      lucy_color()
        |> colour.to_css_rgba_string,
    ),
    attribute.attribute("d", lucy_path()),
    attribute.attribute("pointer-events", "none"),
  ])
}

fn lucy_path() -> String {
  "M 0,0\n"
  <> star_shape_points()
  |> list.map(fn(points) {
    let #(inner, outer) = points
    let #(x, y) = inner
    let #(ox, oy) = outer
    "Q "
    <> x |> float.to_string
    <> ","
    <> y |> float.to_string
    <> " "
    <> ox |> float.to_string
    <> ","
    <> oy |> float.to_string
  })
  |> string.join("\n")
  <> "\nz"
}

fn lucy_color() {
  colour.from_rgb(1.0, 0.5, 1.0)
  |> result.unwrap(colour.black)
}

fn svg_translate(
  svg: lustre_element.Element(msg),
  x: Float,
  y: Float,
) -> lustre_element.Element(msg) {
  svg.g(
    [
      attribute.attribute(
        "transform",
        "translate("
          <> { x |> float.to_string }
          <> ", "
          <> { y |> float.to_string }
          <> ")",
      ),
    ],
    [svg],
  )
}

fn svg_rotate(
  svg: lustre_element.Element(msg),
  angle: Float,
) -> lustre_element.Element(msg) {
  svg.g(
    [
      attribute.attribute(
        "transform",
        "rotate(" <> angle /. maths.pi() *. 180.0 |> float.to_string <> ")",
      ),
    ],
    [svg],
  )
}

type Point =
  #(Float, Float)

fn star_shape_points() -> List(#(Point, Point)) {
  let angle_step = 2.0 *. maths.pi() /. 5.0
  list.range(0, 5)
  |> list.map(fn(i) {
    let angle = angle_step *. { i |> int.to_float }
    #(
      #(maths.cos(angle), maths.sin(angle)) |> point_scale_by(0.268),
      #(
        maths.cos(angle +. { angle_step /. 2.0 }),
        maths.sin(angle +. { angle_step /. 2.0 }),
      )
        |> point_scale_by(1.0),
    )
  })
}

fn point_scale_by(point: Point, scale: Float) -> Point {
  let #(x, y) = point
  #(x *. scale, y *. scale)
}
