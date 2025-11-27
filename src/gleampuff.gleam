import gleam/float
import gleam/int
import gleam/list
import gleam/option
import gleam/result
import gleam/string
import gleam_community/colour
import gleam_community/maths
import lustre
import lustre/attribute
import lustre/effect
import lustre/element as lustre_element
import lustre/element/svg
import lustre/event as lustre_event
import plinth/browser/document
import plinth/browser/element
import plinth/browser/event
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
  State(
    window_width: Float,
    window_height: Float,
    held_down_left: Bool,
    held_down_right: Bool,
    lucy_angle: Float,
    lucy_x: Float,
    lucy_y: Float,
    lucy_x_per_second: Float,
    lucy_y_per_second: Float,
    lucy_y_maximum: Float,
    lucy_y_highscore: Float,
  )
}

const initial_lucy_y_per_second: Float = 2.3

fn init() -> #(State, effect.Effect(Event)) {
  #(
    State(
      window_height: window.inner_height(window.self()) |> int.to_float,
      window_width: window.inner_width(window.self()) |> int.to_float,
      held_down_left: False,
      held_down_right: False,
      lucy_angle: 0.0,
      lucy_x_per_second: 0.0,
      lucy_y_per_second: initial_lucy_y_per_second,
      lucy_x: 0.0,
      lucy_y: 0.0,
      lucy_y_maximum: 0.0,
      lucy_y_highscore: 0.0,
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
      effect.from(fn(dispatch) {
        window.add_event_listener("keydown", fn(e) {
          dispatch(KeyPressed(event.key(e)))
        })
      }),
      effect.from(fn(dispatch) {
        window.add_event_listener("keyup", fn(e) {
          dispatch(KeyReleased(event.key(e)))
        })
      }),
    ]),
  )
}

type Event {
  Resized
  SimulationTickPassed
  KeyPressed(String)
  KeyReleased(String)
}

fn update(state: State, event: Event) -> #(State, effect.Effect(Event)) {
  case event {
    Resized -> #(
      State(
        ..state,
        window_height: window.inner_height(window.self()) |> int.to_float,
        window_width: window.inner_width(window.self()) |> int.to_float,
      ),
      effect.none(),
    )
    KeyPressed(key) -> {
      case key_as_x_direction(key) {
        option.None -> #(state, effect.none())
        option.Some(Left) -> #(
          State(..state, held_down_left: True),
          effect.none(),
        )
        option.Some(Right) -> #(
          State(..state, held_down_right: True),
          effect.none(),
        )
      }
    }
    KeyReleased(key) -> {
      case key_as_x_direction(key) {
        option.None -> #(state, effect.none())
        option.Some(Left) -> #(
          State(..state, held_down_left: False),
          effect.none(),
        )
        option.Some(Right) -> #(
          State(..state, held_down_right: False),
          effect.none(),
        )
      }
    }
    SimulationTickPassed -> {
      let effective_held_x_direction = case
        state.held_down_left,
        state.held_down_right
      {
        True, False -> -1.0
        False, True -> 1.0
        True, True | False, False -> 0.0
      }
      let seconds_passed = 1.0 /. { 1000 / 60 |> int.to_float }
      let new_lucy_y_per_second =
        state.lucy_y_per_second -. { 1.0 *. seconds_passed } |> float.max(-2.2)
      let new_lucy_x_per_second =
        state.lucy_x_per_second
        *. { 1.0 -. { 0.2 *. seconds_passed } }
        +. {
          effective_held_x_direction
          *. {
            4.4
            -. float.absolute_value(
              state.lucy_x_per_second +. effective_held_x_direction *. 2.2,
            )
          }
          *. 3.0
          *. seconds_passed
        }
      let new_lucy_y =
        state.lucy_y +. { new_lucy_y_per_second *. seconds_passed }
      let new_lucy_x =
        state.lucy_x +. { new_lucy_x_per_second *. seconds_passed }
      let lucy_falls_on_cloud: Bool =
        new_lucy_y_per_second <. 0.0
        && cloud_positions
        |> list.any(fn(cloud_position) {
          let #(cloud_x, cloud_y) = cloud_position
          {
            float.absolute_value(new_lucy_y -. cloud_y)
            <=. { cloud_height /. 2.0 }
          }
          && {
            float.absolute_value(new_lucy_x -. cloud_x)
            <=. { cloud_width /. 2.0 }
          }
        })
      case new_lucy_y <. -10.0 {
        True -> #(
          State(
            window_width: state.window_width,
            window_height: state.window_height,
            held_down_left: state.held_down_left,
            held_down_right: state.held_down_right,
            lucy_angle: 0.0,
            lucy_y_per_second: initial_lucy_y_per_second,
            lucy_y: 0.0,
            lucy_x_per_second: 0.0,
            lucy_x: 0.0,
            lucy_y_maximum: 0.0,
            lucy_y_highscore: state.lucy_y_maximum,
          ),
          effect.none(),
        )
        False -> #(
          State(
            ..state,
            lucy_angle: state.lucy_angle +. { 1.0 *. seconds_passed },
            lucy_y_per_second: case lucy_falls_on_cloud {
              True -> 2.0
              False -> new_lucy_y_per_second
            },
            lucy_y: new_lucy_y,
            // TODO
            lucy_x_per_second: new_lucy_x_per_second,
            lucy_x: new_lucy_x,
          ),
          effect.none(),
        )
      }
    }
  }
}

type XDirection {
  Left
  Right
}

fn key_as_x_direction(key: String) -> option.Option(XDirection) {
  case key {
    "ArrowLeft" -> option.Some(Left)
    "ArrowRight" -> option.Some(Right)
    "a" -> option.Some(Left)
    "d" -> option.Some(Right)
    _ -> option.None
  }
}

fn view(state: State) -> lustre_element.Element(Event) {
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
      svg.g([], [
        svg.rect([
          attribute.attribute("x", "0"),
          attribute.attribute("y", "-100%"),
          attribute.attribute("width", "100%"),
          attribute.attribute("height", "100%"),
          attribute.attribute(
            "fill",
            colour.from_rgb(0.0, 0.3, 0.46)
              |> result.unwrap(colour.black)
              |> colour.to_css_rgba_string,
          ),
        ]),
        svg.text(
          [
            attribute.attribute("x", "7"),
            attribute.attribute("y", "8.5"),
            attribute.attribute("pointer-events", "none"),
            attribute.style("font-weight", "bold"),
            attribute.style("font-size", "1px"),
            attribute.style(
              "fill",
              colour.from_rgb(0.9, 1.0, 0.86)
                |> result.unwrap(colour.black)
                |> colour.to_css_rgba_string,
            ),
          ],
          state.lucy_y |> float.truncate |> int.to_string <> "m",
        )
          |> svg_scale(1.0, -1.0),
        svg_lucy()
          |> svg_scale(0.5, 0.5)
          |> svg_rotate(state.lucy_angle)
          |> svg_translate(8.0 +. state.lucy_x, -7.0 +. state.lucy_y),
        svg.g(
          [],
          cloud_positions
            |> list.map(fn(position) {
              let #(x, y) = position
              svg_cloud() |> svg_translate(8.0 +. x, -7.0 +. y)
            }),
        ),
      ])
      |> svg_scale(svg_width /. 16.0, float.negate(svg_height /. 9.0)),
    ],
  )
}

fn svg_lucy() -> lustre_element.Element(event) {
  svg.g([], [
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
    ]),
    svg.circle([
      attribute.attribute("cy", "0.12"),
      attribute.attribute("cx", "-0.2"),
      attribute.attribute("r", "0.1"),
      attribute.attribute("fill", "black"),
    ]),
    svg.circle([
      attribute.attribute("cy", "0.12"),
      attribute.attribute("cx", "0.2"),
      attribute.attribute("r", "0.1"),
      attribute.attribute("fill", "black"),
    ]),
    svg.circle([
      attribute.attribute("cy", "-0.1"),
      attribute.attribute("cx", "0"),
      attribute.attribute("r", "0.12"),
      attribute.attribute("fill", "none"),
      attribute.attribute("stroke", "black"),
      attribute.attribute("stroke-width", "0.08"),
      attribute.attribute("pathLength", "360"),
      attribute.attribute("stroke-dasharray", "0 180 180"),
      attribute.attribute("stroke-linecap", "round"),
    ]),
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

fn svg_cloud() -> lustre_element.Element(event) {
  svg.g(
    [
      attribute.style(
        "fill",
        colour.from_rgb(0.9, 1.0, 0.86)
          |> result.unwrap(colour.black)
          |> colour.to_css_rgba_string,
      ),
    ],
    [
      svg.circle([
        attribute.attribute("cy", "0.12"),
        attribute.attribute("cx", "-0.27"),
        attribute.attribute("r", "0.25"),
      ]),
      svg.circle([
        attribute.attribute("cy", "0.12"),
        attribute.attribute("cx", "0.12"),
        attribute.attribute("r", "0.3"),
      ]),
      svg.circle([
        attribute.attribute("cy", "-0.17"),
        attribute.attribute("cx", "0.3"),
        attribute.attribute("r", "0.21"),
      ]),
      svg.circle([
        attribute.attribute("cy", "0"),
        attribute.attribute("cx", "0.5"),
        attribute.attribute("r", "0.15"),
      ]),
    ],
  )
  |> svg_scale(1.2, 1.2)
}

const cloud_positions: List(Point) = [#(-1.2, 1.8), #(1.2, 4.0)]

const cloud_width: Float = 2.0

const cloud_height: Float = 1.0

fn svg_scale(
  svg: lustre_element.Element(event),
  x: Float,
  y: Float,
) -> lustre_element.Element(event) {
  svg.g(
    [
      attribute.attribute(
        "transform",
        "scale("
          <> { x |> float.to_string }
          <> ", "
          <> { y |> float.to_string }
          <> ")",
      ),
    ],
    [svg],
  )
}

fn svg_translate(
  svg: lustre_element.Element(event),
  x: Float,
  y: Float,
) -> lustre_element.Element(event) {
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
  svg: lustre_element.Element(event),
  angle: Float,
) -> lustre_element.Element(event) {
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
